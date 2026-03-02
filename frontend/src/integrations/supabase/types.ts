export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      booking_payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string | null
          id: string
          notes: string | null
          payment_method: string | null
          received_at: string | null
          received_by: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          received_at?: string | null
          received_by?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          received_at?: string | null
          received_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          amount_paid: number | null
          base_amount: number | null
          check_in: string
          check_out: string
          created_at: string | null
          guest_email: string | null
          guest_id: string | null
          guest_name: string
          guest_phone: string | null
          guests: number | null
          id: string
          notes: string | null
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          room_id: string
          service_charge: number | null
          status: Database["public"]["Enums"]["booking_status"] | null
          tax_amount: number | null
          tenant_id: string
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          amount_paid?: number | null
          base_amount?: number | null
          check_in: string
          check_out: string
          created_at?: string | null
          guest_email?: string | null
          guest_id?: string | null
          guest_name: string
          guest_phone?: string | null
          guests?: number | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          room_id: string
          service_charge?: number | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          tax_amount?: number | null
          tenant_id: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          amount_paid?: number | null
          base_amount?: number | null
          check_in?: string
          check_out?: string
          created_at?: string | null
          guest_email?: string | null
          guest_id?: string | null
          guest_name?: string
          guest_phone?: string | null
          guests?: number | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          room_id?: string
          service_charge?: number | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          tax_amount?: number | null
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_metrics: {
        Row: {
          booking_id: string | null
          campaign_id: string
          clicked_at: string | null
          converted_at: string | null
          created_at: string | null
          id: string
          opened_at: string | null
          recipient_email: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          booking_id?: string | null
          campaign_id: string
          clicked_at?: string | null
          converted_at?: string | null
          created_at?: string | null
          id?: string
          opened_at?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          booking_id?: string | null
          campaign_id?: string
          clicked_at?: string | null
          converted_at?: string | null
          created_at?: string | null
          id?: string
          opened_at?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_metrics_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          channel: string | null
          content: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          scheduled_at: string | null
          segment_id: string | null
          sent_at: string | null
          status: string | null
          subject: string | null
          template: Json | null
          tenant_id: string
        }
        Insert: {
          channel?: string | null
          content?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          scheduled_at?: string | null
          segment_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          template?: Json | null
          tenant_id: string
        }
        Update: {
          channel?: string | null
          content?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          scheduled_at?: string | null
          segment_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          template?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "guest_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          booking_id: string | null
          created_at: string | null
          email_type: string
          error_message: string | null
          id: string
          recipient: string
          status: string | null
          subject: string | null
          tenant_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          email_type: string
          error_message?: string | null
          id?: string
          recipient: string
          status?: string | null
          subject?: string | null
          tenant_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          email_type?: string
          error_message?: string | null
          id?: string
          recipient?: string
          status?: string | null
          subject?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_profiles: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          is_vip: boolean | null
          name: string
          notes: string | null
          phone: string | null
          tags: string[] | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_vip?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          tags?: string[] | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_vip?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          tags?: string[] | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_segments: {
        Row: {
          created_at: string | null
          description: string | null
          guest_count: number | null
          id: string
          is_active: boolean | null
          name: string
          rules: Json | null
          segment_type: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          guest_count?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          rules?: Json | null
          segment_type?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          guest_count?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          rules?: Json | null
          segment_type?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_segments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number | null
          booking_id: string
          created_at: string | null
          id: string
          invoice_number: string
          pdf_url: string | null
          tax_amount: number | null
          tenant_id: string
          total_amount: number | null
        }
        Insert: {
          amount?: number | null
          booking_id: string
          created_at?: string | null
          id?: string
          invoice_number: string
          pdf_url?: string | null
          tax_amount?: number | null
          tenant_id: string
          total_amount?: number | null
        }
        Update: {
          amount?: number | null
          booking_id?: string
          created_at?: string | null
          id?: string
          invoice_number?: string
          pdf_url?: string | null
          tax_amount?: number | null
          tenant_id?: string
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_contacts: {
        Row: {
          created_at: string | null
          email: string | null
          email_opt_in: boolean | null
          id: string
          name: string | null
          phone: string | null
          source: string | null
          tenant_id: string
          whatsapp_opt_in: boolean | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          email_opt_in?: boolean | null
          id?: string
          name?: string | null
          phone?: string | null
          source?: string | null
          tenant_id: string
          whatsapp_opt_in?: boolean | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          email_opt_in?: boolean | null
          id?: string
          name?: string | null
          phone?: string | null
          source?: string | null
          tenant_id?: string
          whatsapp_opt_in?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_campaigns: {
        Row: {
          audience_filter: Json | null
          campaign_name: string
          channel: string | null
          created_at: string | null
          id: string
          scheduled_at: string | null
          status: string | null
          template_id: string | null
          tenant_id: string
        }
        Insert: {
          audience_filter?: Json | null
          campaign_name: string
          channel?: string | null
          created_at?: string | null
          id?: string
          scheduled_at?: string | null
          status?: string | null
          template_id?: string | null
          tenant_id: string
        }
        Update: {
          audience_filter?: Json | null
          campaign_name?: string
          channel?: string | null
          created_at?: string | null
          id?: string
          scheduled_at?: string | null
          status?: string | null
          template_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_logs: {
        Row: {
          campaign_id: string | null
          channel: string | null
          contact_id: string | null
          created_at: string | null
          id: string
          provider_response: Json | null
          sent_at: string | null
          status: string | null
          tenant_id: string
        }
        Insert: {
          campaign_id?: string | null
          channel?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string
          provider_response?: Json | null
          sent_at?: string | null
          status?: string | null
          tenant_id: string
        }
        Update: {
          campaign_id?: string | null
          channel?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string
          provider_response?: Json | null
          sent_at?: string | null
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "message_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string | null
          category: string | null
          channel: string | null
          created_at: string | null
          id: string
          status: string | null
          subject: string | null
          template_name: string
          tenant_id: string
        }
        Insert: {
          body?: string | null
          category?: string | null
          channel?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          subject?: string | null
          template_name: string
          tenant_id: string
        }
        Update: {
          body?: string | null
          category?: string | null
          channel?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          subject?: string | null
          template_name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_bookings: {
        Row: {
          booking_id: string | null
          channel_id: string
          check_in: string | null
          check_out: string | null
          commission: number | null
          created_at: string | null
          external_booking_id: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          raw_data: Json | null
          room_id: string | null
          tenant_id: string
          total_amount: number | null
        }
        Insert: {
          booking_id?: string | null
          channel_id: string
          check_in?: string | null
          check_out?: string | null
          commission?: number | null
          created_at?: string | null
          external_booking_id: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          raw_data?: Json | null
          room_id?: string | null
          tenant_id: string
          total_amount?: number | null
        }
        Update: {
          booking_id?: string | null
          channel_id?: string
          check_in?: string | null
          check_out?: string | null
          commission?: number | null
          created_at?: string | null
          external_booking_id?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          raw_data?: Json | null
          room_id?: string | null
          tenant_id?: string
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ota_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_bookings_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "ota_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_channels: {
        Row: {
          api_credentials: Json | null
          channel_name: string
          channel_type: string
          created_at: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          last_sync_status: string | null
          property_id: string | null
          sync_availability: boolean | null
          sync_bookings: boolean | null
          sync_rates: boolean | null
          tenant_id: string
        }
        Insert: {
          api_credentials?: Json | null
          channel_name: string
          channel_type: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          property_id?: string | null
          sync_availability?: boolean | null
          sync_bookings?: boolean | null
          sync_rates?: boolean | null
          tenant_id: string
        }
        Update: {
          api_credentials?: Json | null
          channel_name?: string
          channel_type?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          property_id?: string | null
          sync_availability?: boolean | null
          sync_bookings?: boolean | null
          sync_rates?: boolean | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ota_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_room_mappings: {
        Row: {
          channel_id: string
          created_at: string | null
          external_room_id: string | null
          external_room_name: string | null
          id: string
          is_active: boolean | null
          rate_plan_id: string | null
          room_id: string
          tenant_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string | null
          external_room_id?: string | null
          external_room_name?: string | null
          id?: string
          is_active?: boolean | null
          rate_plan_id?: string | null
          room_id: string
          tenant_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string | null
          external_room_id?: string | null
          external_room_name?: string | null
          id?: string
          is_active?: boolean | null
          rate_plan_id?: string | null
          room_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ota_room_mappings_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "ota_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_room_mappings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_room_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_sync_logs: {
        Row: {
          channel_id: string
          created_at: string | null
          details: Json | null
          direction: string | null
          id: string
          records_processed: number | null
          status: string | null
          sync_type: string
          tenant_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string | null
          details?: Json | null
          direction?: string | null
          id?: string
          records_processed?: number | null
          status?: string | null
          sync_type: string
          tenant_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string | null
          details?: Json | null
          direction?: string | null
          id?: string
          records_processed?: number | null
          status?: string | null
          sync_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ota_sync_logs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "ota_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_sync_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          content_blocks: Json | null
          created_at: string | null
          id: string
          is_published: boolean | null
          meta_description: string | null
          meta_title: string | null
          og_image: string | null
          slug: string
          tenant_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          content_blocks?: Json | null
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          og_image?: string | null
          slug: string
          tenant_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          content_blocks?: Json | null
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          og_image?: string | null
          slug?: string
          tenant_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          phone: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      room_categories: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          name: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      room_pricing_rules: {
        Row: {
          created_at: string | null
          days_of_week: number[] | null
          end_date: string | null
          id: string
          is_active: boolean | null
          modifier_type: string
          name: string
          price_modifier: number
          room_id: string | null
          rule_type: string
          start_date: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          days_of_week?: number[] | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          modifier_type?: string
          name: string
          price_modifier?: number
          room_id?: string | null
          rule_type?: string
          start_date?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          days_of_week?: number[] | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          modifier_type?: string
          name?: string
          price_modifier?: number
          room_id?: string | null
          rule_type?: string
          start_date?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_pricing_rules_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_pricing_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          amenities: Json | null
          base_occupancy: number | null
          base_price: number
          cancellation_policy: string | null
          category_id: string | null
          check_in_time: string | null
          check_out_time: string | null
          created_at: string | null
          description: string | null
          extra_guest_fee: number | null
          housekeeping_status:
            | Database["public"]["Enums"]["housekeeping_status"]
            | null
          id: string
          images: Json | null
          max_guests: number | null
          minimum_stay: number | null
          name: string
          status: Database["public"]["Enums"]["room_status"] | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          amenities?: Json | null
          base_occupancy?: number | null
          base_price?: number
          cancellation_policy?: string | null
          category_id?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string | null
          description?: string | null
          extra_guest_fee?: number | null
          housekeeping_status?:
            | Database["public"]["Enums"]["housekeeping_status"]
            | null
          id?: string
          images?: Json | null
          max_guests?: number | null
          minimum_stay?: number | null
          name: string
          status?: Database["public"]["Enums"]["room_status"] | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          amenities?: Json | null
          base_occupancy?: number | null
          base_price?: number
          cancellation_policy?: string | null
          category_id?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string | null
          description?: string | null
          extra_guest_fee?: number | null
          housekeeping_status?:
            | Database["public"]["Enums"]["housekeeping_status"]
            | null
          id?: string
          images?: Json | null
          max_guests?: number | null
          minimum_stay?: number | null
          name?: string
          status?: Database["public"]["Enums"]["room_status"] | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "room_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      segment_members: {
        Row: {
          created_at: string | null
          guest_email: string
          id: string
          segment_id: string
        }
        Insert: {
          created_at?: string | null
          guest_email: string
          id?: string
          segment_id: string
        }
        Update: {
          created_at?: string | null
          guest_email?: string
          id?: string
          segment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "segment_members_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "guest_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          currency: string | null
          domain: string | null
          email_settings: Json | null
          gst_enabled: boolean | null
          gst_number: string | null
          gst_percentage: number | null
          id: string
          logo_url: string | null
          name: string
          service_charge_enabled: boolean | null
          service_charge_percentage: number | null
          settings: Json | null
          slug: string
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          currency?: string | null
          domain?: string | null
          email_settings?: Json | null
          gst_enabled?: boolean | null
          gst_number?: string | null
          gst_percentage?: number | null
          id?: string
          logo_url?: string | null
          name: string
          service_charge_enabled?: boolean | null
          service_charge_percentage?: number | null
          settings?: Json | null
          slug: string
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          currency?: string | null
          domain?: string | null
          email_settings?: Json | null
          gst_enabled?: boolean | null
          gst_number?: string | null
          gst_percentage?: number | null
          id?: string
          logo_url?: string | null
          name?: string
          service_charge_enabled?: boolean | null
          service_charge_percentage?: number | null
          settings?: Json | null
          slug?: string
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_room_availability: {
        Args: { _check_in: string; _check_out: string; _room_id: string }
        Returns: boolean
      }
      get_user_tenant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "staff" | "guest"
      booking_status: "pending" | "confirmed" | "cancelled" | "completed"
      housekeeping_status: "clean" | "dirty" | "in_progress" | "inspecting"
      payment_status: "unpaid" | "partial" | "paid"
      room_status: "available" | "maintenance" | "unavailable"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "staff", "guest"],
      booking_status: ["pending", "confirmed", "cancelled", "completed"],
      housekeeping_status: ["clean", "dirty", "in_progress", "inspecting"],
      payment_status: ["unpaid", "partial", "paid"],
      room_status: ["available", "maintenance", "unavailable"],
    },
  },
} as const
