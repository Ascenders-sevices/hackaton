import json
import uuid

from django.db import connection
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.views.engagement_utils import (
    _serialize,
    archive_custom_segment,
    build_segments,
    create_custom_segment,
    create_message_logs,
    get_campaigns,
    get_custom_segments,
    get_marketing_contacts,
    get_message_logs,
    get_message_template_by_id,
    get_message_templates,
    normalize_channel,
    resolve_recipients,
    update_custom_segment,
)


def _campaign_snapshot(segment_key, segment_name, template_id, template_name):
    return {
        "segment_key": segment_key,
        "segment_name": segment_name,
        "template_id": template_id,
        "template_name": template_name,
    }


class MarketingDashboard(APIView):
    def get(self, request):
        tenant_id = request.user.tenant_id
        contacts = get_marketing_contacts(tenant_id)
        segments = build_segments(tenant_id)
        campaigns = get_campaigns(tenant_id)
        logs = get_message_logs(tenant_id, limit=25)
        templates = get_message_templates(tenant_id)

        summary = {
            "contact_count": len(contacts),
            "email_opt_in_count": sum(1 for contact in contacts if contact.get("email_opt_in")),
            "whatsapp_opt_in_count": sum(1 for contact in contacts if contact.get("whatsapp_opt_in")),
            "campaign_count": len(campaigns),
            "draft_campaign_count": sum(1 for campaign in campaigns if campaign.get("status") == "draft"),
            "sent_campaign_count": sum(1 for campaign in campaigns if campaign.get("status") == "sent"),
            "logged_messages": sum(campaign.get("logged_messages", 0) for campaign in campaigns),
        }

        return Response(
            {
                "summary": summary,
                "contacts": contacts,
                "segments": segments,
                "campaigns": campaigns,
                "logs": logs,
                "templates": templates,
            }
        )


class MarketingContactList(APIView):
    def get(self, request):
        return Response(get_marketing_contacts(request.user.tenant_id))

    def post(self, request):
        tenant_id = request.user.tenant_id
        payload = request.data
        name = (payload.get("name") or "").strip() or None
        email = (payload.get("email") or "").strip() or None
        phone = (payload.get("phone") or "").strip() or None
        source = (payload.get("source") or "manual").strip() or "manual"
        email_opt_in = bool(payload.get("email_opt_in"))
        whatsapp_opt_in = bool(payload.get("whatsapp_opt_in"))

        if not email and not phone:
            return Response({"error": "Email or phone is required"}, status=status.HTTP_400_BAD_REQUEST)

        with connection.cursor() as cur:
            cur.execute(
                """
                INSERT INTO marketing_contacts (
                    id, tenant_id, name, email, phone, source, email_opt_in, whatsapp_opt_in
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, tenant_id, name, email, phone, source, email_opt_in, whatsapp_opt_in, created_at
                """,
                [
                    str(uuid.uuid4()),
                    tenant_id,
                    name,
                    email,
                    phone,
                    source,
                    email_opt_in,
                    whatsapp_opt_in,
                ],
            )
            row = _serialize(cur.fetchone(), [c[0] for c in cur.description])
        return Response(row, status=status.HTTP_201_CREATED)


class MarketingSegmentList(APIView):
    def get(self, request):
        return Response(get_custom_segments(request.user.tenant_id))

    def post(self, request):
        tenant_id = request.user.tenant_id
        payload = request.data
        name = (payload.get("name") or "").strip()
        description = (payload.get("description") or "").strip() or None
        rules = payload.get("rules") or {}

        if not name:
            return Response({"error": "Segment name is required"}, status=status.HTTP_400_BAD_REQUEST)

        segment = create_custom_segment(tenant_id, name=name, description=description, rules=rules)
        return Response(segment, status=status.HTTP_201_CREATED)


class MarketingSegmentDetail(APIView):
    def put(self, request, segment_id):
        tenant_id = request.user.tenant_id
        payload = request.data
        name = (payload.get("name") or "").strip()
        description = (payload.get("description") or "").strip() or None
        rules = payload.get("rules") or {}

        if not name:
            return Response({"error": "Segment name is required"}, status=status.HTTP_400_BAD_REQUEST)

        segment = update_custom_segment(segment_id, tenant_id, name=name, description=description, rules=rules)
        if not segment:
            return Response({"error": "Segment not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(segment)

    def delete(self, request, segment_id):
        deleted = archive_custom_segment(segment_id, request.user.tenant_id)
        if not deleted:
            return Response({"error": "Segment not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CampaignList(APIView):
    def post(self, request):
        tenant_id = request.user.tenant_id
        payload = request.data
        name = (payload.get("name") or "").strip()
        description = (payload.get("description") or "").strip() or None
        channel = normalize_channel(payload.get("channel"))
        subject = (payload.get("subject") or "").strip() or None
        content = (payload.get("content") or "").strip()
        segment_key = (payload.get("segment_key") or "all_guests").strip() or "all_guests"
        template_id = (payload.get("template_id") or "").strip() or None

        if not name:
            return Response({"error": "Campaign name is required"}, status=status.HTTP_400_BAD_REQUEST)

        template_name = None
        if template_id:
            template = get_message_template_by_id(tenant_id, template_id)
            if not template:
                return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
            subject = subject or template.get("subject")
            content = content or template.get("content") or ""
            channel = normalize_channel(template.get("channel") or channel)
            template_name = template.get("name")

        if not content:
            return Response({"error": "Campaign content is required"}, status=status.HTTP_400_BAD_REQUEST)

        segments = {segment["key"]: segment for segment in build_segments(tenant_id)}
        segment = segments.get(segment_key)
        if not segment:
            return Response({"error": "Unknown audience segment"}, status=status.HTTP_400_BAD_REQUEST)

        snapshot = _campaign_snapshot(segment_key, segment.get("name"), template_id, template_name)

        with connection.cursor() as cur:
            cur.execute(
                """
                INSERT INTO campaigns (
                    id, tenant_id, name, description, channel, status, subject, content, template
                )
                VALUES (%s, %s, %s, %s, %s, 'draft', %s, %s, %s::jsonb)
                RETURNING id, tenant_id, name, description, channel, status, subject, content, template,
                          segment_id, scheduled_at, sent_at, created_at
                """,
                [
                    str(uuid.uuid4()),
                    tenant_id,
                    name,
                    description,
                    channel,
                    subject,
                    content,
                    json.dumps(snapshot),
                ],
            )
            row = _serialize(cur.fetchone(), [c[0] for c in cur.description])

        row["template"] = snapshot
        return Response(row, status=status.HTTP_201_CREATED)


class CampaignDetail(APIView):
    def put(self, request, campaign_id):
        tenant_id = request.user.tenant_id
        payload = request.data
        existing = next((campaign for campaign in get_campaigns(tenant_id) if campaign.get("id") == campaign_id), None)
        if not existing:
            return Response({"error": "Campaign not found"}, status=status.HTTP_404_NOT_FOUND)

        name = (payload.get("name") or existing.get("name") or "").strip()
        description = (payload.get("description") if payload.get("description") is not None else existing.get("description"))
        description = description.strip() if isinstance(description, str) and description else description
        channel = normalize_channel(payload.get("channel") or existing.get("channel"))
        subject = (payload.get("subject") if payload.get("subject") is not None else existing.get("subject"))
        subject = subject.strip() if isinstance(subject, str) and subject else subject
        content = (payload.get("content") if payload.get("content") is not None else existing.get("content") or "").strip()
        segment_key = (payload.get("segment_key") or existing.get("template", {}).get("segment_key") or "all_guests").strip()
        template_id = (payload.get("template_id") or existing.get("template", {}).get("template_id") or "").strip() or None

        segments = {segment["key"]: segment for segment in build_segments(tenant_id)}
        segment = segments.get(segment_key)
        if not segment:
            return Response({"error": "Unknown audience segment"}, status=status.HTTP_400_BAD_REQUEST)

        template_name = existing.get("template", {}).get("template_name")
        if template_id:
            template = get_message_template_by_id(tenant_id, template_id)
            if not template:
                return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
            if not subject:
                subject = template.get("subject")
            if not content:
                content = template.get("content") or ""
            channel = normalize_channel(template.get("channel") or channel)
            template_name = template.get("name")

        if not name:
            return Response({"error": "Campaign name is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not content:
            return Response({"error": "Campaign content is required"}, status=status.HTTP_400_BAD_REQUEST)

        snapshot = _campaign_snapshot(segment_key, segment.get("name"), template_id, template_name)

        with connection.cursor() as cur:
            cur.execute(
                """
                UPDATE campaigns
                SET name = %s,
                    description = %s,
                    channel = %s,
                    subject = %s,
                    content = %s,
                    template = %s::jsonb
                WHERE tenant_id = %s AND id = %s
                RETURNING id, tenant_id, name, description, channel, status, subject, content, template,
                          segment_id, scheduled_at, sent_at, created_at
                """,
                [name, description, channel, subject, content, json.dumps(snapshot), tenant_id, campaign_id],
            )
            row = cur.fetchone()
            if not row:
                return Response({"error": "Campaign not found"}, status=status.HTTP_404_NOT_FOUND)
            data = _serialize(row, [c[0] for c in cur.description])

        data["template"] = snapshot
        return Response(data)


class CampaignLaunch(APIView):
    def post(self, request, campaign_id):
        tenant_id = request.user.tenant_id
        campaign = next((item for item in get_campaigns(tenant_id) if item.get("id") == campaign_id), None)
        if not campaign:
            return Response({"error": "Campaign not found"}, status=status.HTTP_404_NOT_FOUND)

        template_snapshot = campaign.get("template") or {}
        segment_key = (request.data.get("segment_key") or template_snapshot.get("segment_key") or "all_guests").strip()
        channel = normalize_channel(campaign.get("channel"))
        subject = campaign.get("subject")
        content = campaign.get("content") or ""
        template_id = template_snapshot.get("template_id")

        if not content:
            return Response({"error": "Campaign content is empty"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            recipients = resolve_recipients(tenant_id, channel, segment_key=segment_key)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not recipients:
            return Response({"error": "No recipients found for this campaign"}, status=status.HTTP_400_BAD_REQUEST)

        created_logs = create_message_logs(
            tenant_id,
            channel=channel,
            source="marketing_campaign",
            recipients=recipients,
            subject_template=subject,
            content_template=content,
            template_id=template_id,
            campaign_id=campaign_id,
            metadata={"segment_key": segment_key, "campaign_name": campaign.get("name")},
            status="logged",
        )

        with connection.cursor() as cur:
            for log in created_logs:
                if log.get("recipient_email"):
                    cur.execute(
                        """
                        INSERT INTO campaign_metrics (
                            id, campaign_id, recipient_email, status, sent_at, created_at
                        )
                        VALUES (%s, %s, %s, %s, NOW(), NOW())
                        """,
                        [str(uuid.uuid4()), campaign_id, log.get("recipient_email"), "logged"],
                    )
            cur.execute(
                """
                UPDATE campaigns
                SET status = 'sent', sent_at = NOW()
                WHERE tenant_id = %s AND id = %s
                """,
                [tenant_id, campaign_id],
            )

        return Response(
            {
                "success": True,
                "campaign_id": campaign_id,
                "campaign_name": campaign.get("name"),
                "recipient_count": len(created_logs),
                "logs": created_logs[:10],
                "provider": "activity-log",
            }
        )
