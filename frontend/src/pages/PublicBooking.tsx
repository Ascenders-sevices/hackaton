import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, BedDouble, CalendarDays, CheckCircle2, Mail, MapPin, Phone, Search, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type PropertyInfo = {
  id: string;
  name: string;
  slug: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  currency: string | null;
  timezone: string | null;
  gst_enabled: boolean;
  gst_percentage: number;
  service_charge_enabled: boolean;
  service_charge_percentage: number;
};

type RoomPricing = {
  nights: number;
  base_amount: number;
  extra_guest_total: number;
  tax_amount: number;
  service_charge: number;
  total_amount: number;
};

type Room = {
  id: string;
  name: string;
  description: string | null;
  max_guests: number;
  base_price: number;
  amenities: string[] | string | null;
  images: string[] | string | null;
  minimum_stay: number;
  base_occupancy: number;
  extra_guest_fee: number;
  check_in_time: string | null;
  check_out_time: string | null;
  cancellation_policy: string | null;
  category_name: string | null;
  pricing?: RoomPricing;
};

type PropertyResponse = {
  property: PropertyInfo;
  rooms: Room[];
  search: {
    check_in: string | null;
    check_out: string | null;
    guests: number;
    nights: number;
  };
};

type BookingResponse = {
  message: string;
  booking: {
    id: string;
    guest_name: string;
    guest_email: string;
    guest_phone: string | null;
    check_in: string;
    check_out: string;
    guests: number;
    total_amount: number;
    status: string;
  };
  property: {
    name: string;
    slug: string;
    currency: string;
  };
  room: {
    id: string;
    name: string;
    check_in_time: string | null;
    check_out_time: string | null;
  };
  pricing: RoomPricing;
};

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function defaultSearchState() {
  const today = new Date();
  const checkIn = new Date(today);
  checkIn.setDate(today.getDate() + 1);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkIn.getDate() + 1);

  return {
    check_in: formatDate(checkIn),
    check_out: formatDate(checkOut),
    guests: 2,
  };
}

function formatCurrency(amount: number, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

function parseErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Something went wrong";
  try {
    const parsed = JSON.parse(message);
    return parsed.error || message;
  } catch {
    return message;
  }
}

function normalizeStringArray(value: string[] | string | null | undefined) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

const PublicBooking = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const reservationPanelRef = useRef<HTMLDivElement | null>(null);

  const [slugInput, setSlugInput] = useState(slug || "");
  const [search, setSearch] = useState(defaultSearchState);
  const [loading, setLoading] = useState(false);
  const [propertyData, setPropertyData] = useState<PropertyResponse | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingResponse | null>(null);
  const [bookingForm, setBookingForm] = useState({
    guest_name: "",
    guest_email: "",
    guest_phone: "",
    notes: "",
  });

  async function loadProperty(targetSlug: string, withSearch = true) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (withSearch) {
        params.set("check_in", search.check_in);
        params.set("check_out", search.check_out);
        params.set("guests", String(search.guests));
      }
      const query = params.toString();
      const data = await api.publicGet<PropertyResponse>(
        `/public/properties/${encodeURIComponent(targetSlug)}${query ? `?${query}` : ""}`
      );
      setPropertyData(data);
      setConfirmation(null);
      if (selectedRoomId && !data.rooms.some((room) => room.id === selectedRoomId)) {
        setSelectedRoomId(null);
      }
    } catch (error) {
      setPropertyData(null);
      setSelectedRoomId(null);
      toast({
        title: "Booking page unavailable",
        description: parseErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSlugInput(slug || "");
    if (slug) {
      void loadProperty(slug, true);
    } else {
      setPropertyData(null);
      setSelectedRoomId(null);
      setConfirmation(null);
    }
  }, [slug]);

  const selectedRoom = propertyData?.rooms.find((room) => room.id === selectedRoomId) || null;
  const currency = propertyData?.property.currency || "INR";
  const availableRooms = propertyData?.rooms.length || 0;
  const nights = propertyData?.search.nights || 0;

  const scrollToReservation = () => {
    reservationPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleRoomSelect = (roomId: string) => {
    setSelectedRoomId(roomId);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1279px)").matches) {
      window.setTimeout(() => scrollToReservation(), 80);
    }
  };

  const handleSearch = async () => {
    if (!slugInput.trim()) {
      toast({
        title: "Property slug required",
        description: "Enter a property slug to open its booking page.",
        variant: "destructive",
      });
      return;
    }

    const targetSlug = slugInput.trim().toLowerCase();
    if (slug !== targetSlug) {
      navigate(`/book/${targetSlug}`);
      return;
    }
    await loadProperty(targetSlug, true);
  };

  const handleBooking = async () => {
    if (!slug || !selectedRoom) return;

    setSubmitting(true);
    try {
      const result = await api.publicPost<BookingResponse>(
        `/public/properties/${encodeURIComponent(slug)}/bookings`,
        {
          room_id: selectedRoom.id,
          guest_name: bookingForm.guest_name,
          guest_email: bookingForm.guest_email,
          guest_phone: bookingForm.guest_phone,
          notes: bookingForm.notes,
          guests: search.guests,
          check_in: search.check_in,
          check_out: search.check_out,
        }
      );
      setConfirmation(result);
      setSelectedRoomId(null);
      setBookingForm({
        guest_name: "",
        guest_email: "",
        guest_phone: "",
        notes: "",
      });
      toast({ title: "Reservation created", description: "Your booking request has been submitted." });
      await loadProperty(slug, true);
    } catch (error) {
      toast({
        title: "Booking failed",
        description: parseErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.14),_transparent_30%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.45))]">
      <div className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 sm:py-8 xl:px-8 xl:pb-8">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[2rem] border bg-background/90 shadow-sm backdrop-blur">
            <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-end">
              <div className="space-y-5">
                <Badge variant="outline" className="gap-2 px-3 py-1 text-xs uppercase tracking-[0.24em]">
                  <BedDouble className="h-3.5 w-3.5" />
                  AIR BEE Booking Engine
                </Badge>
                <div className="space-y-3">
                  <h1 className="text-3xl font-bold tracking-tight sm:text-4xl xl:text-5xl">
                    {propertyData?.property.name || "Book your stay"}
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                    Search live room availability, compare pricing, and submit a reservation request in one flow.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border bg-muted/35 p-4">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Available now</p>
                    <p className="mt-2 text-2xl font-semibold">{propertyData ? availableRooms : "--"}</p>
                    <p className="text-xs text-muted-foreground">
                      {propertyData ? "Rooms matching the selected dates" : "Load a property to see inventory"}
                    </p>
                  </div>
                  <div className="rounded-2xl border bg-muted/35 p-4">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Stay length</p>
                    <p className="mt-2 text-2xl font-semibold">{propertyData ? nights : "--"}</p>
                    <p className="text-xs text-muted-foreground">
                      {propertyData ? "Night(s) in your current search" : "Choose check-in and check-out"}
                    </p>
                  </div>
                  <div className="rounded-2xl border bg-muted/35 p-4">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Guest count</p>
                    <p className="mt-2 text-2xl font-semibold">{search.guests}</p>
                    <p className="text-xs text-muted-foreground">Capacity filter applied to each room</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="rounded-2xl border bg-background/80 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Currency</p>
                  <p className="mt-2 text-lg font-semibold">{propertyData?.property.currency || "INR"}</p>
                </div>
                <div className="rounded-2xl border bg-background/80 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Timezone</p>
                  <p className="mt-2 text-lg font-semibold">{propertyData?.property.timezone || "Asia/Kolkata"}</p>
                </div>
                <div className="rounded-2xl border bg-background/80 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Property slug</p>
                  <p className="mt-2 break-all text-lg font-semibold">{propertyData?.property.slug || slugInput || "--"}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border bg-background/90 p-5 shadow-sm backdrop-blur sm:p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-medium">Search availability</p>
                <p className="text-sm text-muted-foreground">
                  Works on mobile as a stacked form and on desktop as a single booking control bar.
                </p>
              </div>
              {propertyData ? (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border px-3 py-1">{propertyData.property.name}</span>
                  <span className="rounded-full border px-3 py-1">{availableRooms} room(s)</span>
                  <span className="rounded-full border px-3 py-1">{nights} night(s)</span>
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))]">
              <div className="space-y-2">
                <Label htmlFor="property-slug">Property slug</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="property-slug"
                    value={slugInput}
                    onChange={(event) => setSlugInput(event.target.value)}
                    placeholder="for example demo-user"
                    className="sm:flex-1"
                  />
                  <Button onClick={handleSearch} disabled={loading} className="w-full sm:w-auto">
                    <Search className="mr-2 h-4 w-4" />
                    {loading ? "Searching..." : "Search"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="check-in">Check-in</Label>
                <Input
                  id="check-in"
                  type="date"
                  value={search.check_in}
                  min={formatDate(new Date())}
                  onChange={(event) => setSearch((prev) => ({ ...prev, check_in: event.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="check-out">Check-out</Label>
                <Input
                  id="check-out"
                  type="date"
                  value={search.check_out}
                  min={search.check_in}
                  onChange={(event) => setSearch((prev) => ({ ...prev, check_out: event.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="guests">Guests</Label>
                <Input
                  id="guests"
                  type="number"
                  min={1}
                  max={10}
                  value={search.guests}
                  onChange={(event) =>
                    setSearch((prev) => ({
                      ...prev,
                      guests: Math.max(1, parseInt(event.target.value || "1", 10)),
                    }))
                  }
                />
              </div>
            </div>
          </section>

          {propertyData ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
              <div className="space-y-4">
                <Card className="rounded-[2rem] border bg-background/90 shadow-sm">
                  <CardHeader className="space-y-3">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-2xl">
                      <CalendarDays className="h-5 w-5 text-primary" />
                      Available rooms
                    </CardTitle>
                    <CardDescription>
                      {nights > 0
                        ? `${availableRooms} room(s) available for ${nights} night(s).`
                        : "Select dates to view live availability and pricing."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {availableRooms === 0 ? (
                      <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
                        No rooms are available for the selected dates.
                      </div>
                    ) : (
                      propertyData.rooms.map((room) => {
                        const amenities = normalizeStringArray(room.amenities);

                        return (
                          <article
                            key={room.id}
                            className="rounded-[1.75rem] border bg-muted/30 p-4 transition-colors hover:border-primary/40 sm:p-5"
                          >
                            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-xl font-semibold">{room.name}</h3>
                                  {room.category_name ? <Badge variant="secondary">{room.category_name}</Badge> : null}
                                </div>
                                {room.description ? (
                                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                                    {room.description}
                                  </p>
                                ) : null}
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  <span className="rounded-full border px-3 py-1">
                                    Up to {room.max_guests} guest(s)
                                  </span>
                                  <span className="rounded-full border px-3 py-1">
                                    Min stay {room.minimum_stay || 1} night(s)
                                  </span>
                                  <span className="rounded-full border px-3 py-1">
                                    Check-in {room.check_in_time || "14:00"}
                                  </span>
                                  <span className="rounded-full border px-3 py-1">
                                    Check-out {room.check_out_time || "11:00"}
                                  </span>
                                </div>
                                {amenities.length ? (
                                  <div className="flex flex-wrap gap-2">
                                    {amenities.slice(0, 6).map((item) => (
                                      <Badge key={item} variant="outline">
                                        {item}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : null}
                              </div>

                              <div className="w-full rounded-[1.5rem] border bg-background p-4 lg:max-w-xs">
                                <div className="space-y-1">
                                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                    Starting from
                                  </p>
                                  <p className="text-2xl font-bold">
                                    {formatCurrency(room.base_price, currency)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">per night</p>
                                </div>

                                {room.pricing ? (
                                  <div className="mt-4 space-y-1 text-sm">
                                    <div className="flex items-center justify-between">
                                      <span className="text-muted-foreground">Stay total</span>
                                      <span className="font-semibold">
                                        {formatCurrency(room.pricing.total_amount, currency)}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                      <span>Taxes + service</span>
                                      <span>
                                        {formatCurrency(
                                          room.pricing.tax_amount + room.pricing.service_charge,
                                          currency
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                ) : null}

                                <Button className="mt-4 w-full" onClick={() => handleRoomSelect(room.id)}>
                                  Reserve this room
                                  <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>

              <div ref={reservationPanelRef} className="space-y-4 xl:sticky xl:top-6">
                <Card className="rounded-[2rem] border bg-background/90 shadow-sm">
                  <CardHeader>
                    <CardTitle>Property details</CardTitle>
                    <CardDescription>Share this page with guests using your property slug.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {propertyData.property.address ? (
                      <div className="flex items-start gap-3">
                        <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                        <span>{propertyData.property.address}</span>
                      </div>
                    ) : null}
                    {propertyData.property.contact_email ? (
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-primary" />
                        <span className="break-all">{propertyData.property.contact_email}</span>
                      </div>
                    ) : null}
                    {propertyData.property.contact_phone ? (
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-primary" />
                        <span>{propertyData.property.contact_phone}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-3">
                      <Users className="h-4 w-4 text-primary" />
                      <span>{search.guests} guest(s) selected</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-[2rem] border bg-background/90 shadow-sm">
                  <CardHeader>
                    <CardTitle>{selectedRoom ? `Reserve ${selectedRoom.name}` : "Reservation form"}</CardTitle>
                    <CardDescription>
                      {selectedRoom
                        ? "Submit your details to create a pending reservation request."
                        : "Choose a room to continue."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedRoom ? (
                      <>
                        <div className="rounded-2xl border bg-muted/40 p-4 text-sm">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-muted-foreground">Room</span>
                            <span className="text-right font-medium">{selectedRoom.name}</span>
                          </div>
                          {selectedRoom.pricing ? (
                            <div className="mt-2 flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">Reservation total</span>
                              <span className="text-right font-semibold">
                                {formatCurrency(selectedRoom.pricing.total_amount, currency)}
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="guest-name">Full name</Label>
                          <Input
                            id="guest-name"
                            value={bookingForm.guest_name}
                            onChange={(event) =>
                              setBookingForm((prev) => ({ ...prev, guest_name: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="guest-email">Email</Label>
                          <Input
                            id="guest-email"
                            type="email"
                            value={bookingForm.guest_email}
                            onChange={(event) =>
                              setBookingForm((prev) => ({ ...prev, guest_email: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="guest-phone">Phone</Label>
                          <Input
                            id="guest-phone"
                            value={bookingForm.guest_phone}
                            onChange={(event) =>
                              setBookingForm((prev) => ({ ...prev, guest_phone: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="guest-notes">Special requests</Label>
                          <Textarea
                            id="guest-notes"
                            value={bookingForm.notes}
                            onChange={(event) =>
                              setBookingForm((prev) => ({ ...prev, notes: event.target.value }))
                            }
                            placeholder="Arrival time, preferences, add-on requests..."
                          />
                        </div>
                        <Button className="w-full" onClick={handleBooking} disabled={submitting}>
                          {submitting ? "Submitting..." : "Submit reservation"}
                        </Button>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
                        Select a room from the availability list to continue.
                      </div>
                    )}
                  </CardContent>
                </Card>

                {confirmation ? (
                  <Card className="rounded-[2rem] border border-emerald-200 bg-emerald-50/80 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-5 w-5" />
                        Reservation submitted
                      </CardTitle>
                      <CardDescription>Booking ID: {confirmation.booking.id}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p>
                        {confirmation.booking.guest_name}, your request for{" "}
                        <span className="font-medium">{confirmation.room.name}</span> has been created.
                      </p>
                      <p>
                        Total quoted price:{" "}
                        <span className="font-semibold">
                          {formatCurrency(confirmation.pricing.total_amount, confirmation.property.currency)}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Status: {confirmation.booking.status}. Follow up with the property to confirm payment and final approval.
                      </p>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </div>
          ) : (
            <Card className="rounded-[2rem] border bg-background/90 shadow-sm">
              <CardContent className="px-6 py-14 text-center text-sm text-muted-foreground">
                {loading
                  ? "Loading property availability..."
                  : "Open a property by slug to search rooms and accept bookings."}
              </CardContent>
            </Card>
          )}
        </div>

        {selectedRoom ? (
          <div className="fixed inset-x-3 bottom-3 z-20 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur xl:hidden">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{selectedRoom.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(selectedRoom.pricing?.total_amount || selectedRoom.base_price, currency)}
                  {selectedRoom.pricing ? " total stay" : " per night"}
                </p>
              </div>
              <Button onClick={scrollToReservation} className="shrink-0">
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PublicBooking;
