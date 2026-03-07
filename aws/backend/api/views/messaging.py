from django.db import connection
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.views.engagement_utils import (
    build_segments,
    create_message_template,
    create_message_logs,
    get_guest_audience,
    get_message_logs,
    get_message_template_by_id,
    get_message_templates,
    normalize_channel,
    resolve_recipients,
    update_message_template,
)


class MessagingDashboard(APIView):
    def get(self, request):
        tenant_id = request.user.tenant_id
        templates = get_message_templates(tenant_id)
        logs = get_message_logs(tenant_id, limit=80)
        audience = get_guest_audience(tenant_id)
        segments = build_segments(tenant_id)

        summary = {
            "template_count": len(templates),
            "message_count": len(logs),
            "email_templates": sum(1 for template in templates if template.get("channel") == "email"),
            "whatsapp_templates": sum(1 for template in templates if template.get("channel") == "whatsapp"),
            "reachable_guests": sum(1 for guest in audience if guest.get("email") or guest.get("phone")),
            "recent_logged": sum(1 for log in logs if log.get("status") == "logged"),
        }

        return Response(
            {
                "summary": summary,
                "templates": templates,
                "logs": logs,
                "segments": segments,
                "audience": audience,
            }
        )


class MessageTemplateList(APIView):
    def get(self, request):
        return Response(get_message_templates(request.user.tenant_id))

    def post(self, request):
        tenant_id = request.user.tenant_id
        payload = request.data
        name = (payload.get("name") or "").strip()
        content = (payload.get("content") or "").strip()
        subject = (payload.get("subject") or "").strip() or None
        channel = normalize_channel(payload.get("channel"))
        variables = payload.get("variables") or []

        if not name:
            return Response({"error": "Template name is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not content:
            return Response({"error": "Template content is required"}, status=status.HTTP_400_BAD_REQUEST)

        row = create_message_template(
            tenant_id,
            name=name,
            channel=channel,
            subject=subject,
            content=content,
            variables=variables,
            is_active=True,
        )
        return Response(row, status=status.HTTP_201_CREATED)


class MessageTemplateDetail(APIView):
    def put(self, request, template_id):
        tenant_id = request.user.tenant_id
        payload = request.data
        template = get_message_template_by_id(tenant_id, template_id)
        if not template:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)

        name = (payload.get("name") or template.get("name") or "").strip()
        content = (payload.get("content") or template.get("content") or "").strip()
        subject = (payload.get("subject") if payload.get("subject") is not None else template.get("subject"))
        subject = subject.strip() if isinstance(subject, str) else subject
        channel = normalize_channel(payload.get("channel") or template.get("channel"))
        variables = payload.get("variables") if payload.get("variables") is not None else template.get("variables")
        is_active = payload.get("is_active") if payload.get("is_active") is not None else template.get("is_active")

        if not name:
            return Response({"error": "Template name is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not content:
            return Response({"error": "Template content is required"}, status=status.HTTP_400_BAD_REQUEST)

        data = update_message_template(
            tenant_id,
            template_id,
            name=name,
            channel=channel,
            subject=subject or None,
            content=content,
            variables=variables or [],
            is_active=bool(is_active),
        )
        if not data:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(data)

    def delete(self, request, template_id):
        tenant_id = request.user.tenant_id
        with connection.cursor() as cur:
            cur.execute("DELETE FROM message_templates WHERE tenant_id = %s AND id = %s", [tenant_id, template_id])
        return Response(status=status.HTTP_204_NO_CONTENT)


class MessagingSendView(APIView):
    def post(self, request):
        tenant_id = request.user.tenant_id
        payload = request.data

        channel = normalize_channel(payload.get("channel"))
        template_id = payload.get("template_id")
        subject = (payload.get("subject") or "").strip() or None
        content = (payload.get("content") or "").strip()
        segment_key = (payload.get("segment_key") or "").strip() or None
        manual_recipients = payload.get("manual_recipients")
        guest_ids = payload.get("guest_ids") or []
        contact_ids = payload.get("contact_ids") or []
        source = (payload.get("source") or "messaging").strip() or "messaging"

        if template_id:
            template = get_message_template_by_id(tenant_id, template_id)
            if not template:
                return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
            subject = subject or template.get("subject")
            content = content or template.get("content") or ""
            channel = normalize_channel(template.get("channel") or channel)
        else:
            template = None

        if not content:
            return Response({"error": "Message content is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            recipients = resolve_recipients(
                tenant_id,
                channel,
                segment_key=segment_key,
                manual_recipients=manual_recipients,
                guest_ids=guest_ids,
                contact_ids=contact_ids,
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not recipients:
            return Response(
                {"error": f"No recipients found for the selected {channel} audience"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created = create_message_logs(
            tenant_id,
            channel=channel,
            source=source,
            recipients=recipients,
            subject_template=subject,
            content_template=content,
            template_id=template_id if template else None,
            metadata={"segment_key": segment_key, "manual": bool(manual_recipients)},
            status="logged",
        )

        return Response(
            {
                "success": True,
                "channel": channel,
                "recipient_count": len(created),
                "recipients": created[:5],
                "logs": created,
                "provider": "activity-log",
            },
            status=status.HTTP_201_CREATED,
        )
