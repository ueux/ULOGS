"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowUpCircle,
  Trash2,
  Check,
  Download,
  AlertTriangle,
  CreditCard,
  X,
} from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getToken, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

type CurrentPlanResponse = {
  plan?: string | null;
}
type BillingSessionResponse = {
  url: string;
}
type BillingPortalSessionResponse = {
  url: string;
}

type PaymentInvoice = {
  id: string;
  stripe_invoice_id: string;
  status: string | null;
  currency: string | null;
  amount_due: number | null;
  amount_paid: number | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string | null;

};

type PaymentInvoicesResponse = {
  invoices: PaymentInvoice[];
};

export default function Page() {
  const { user, isLoaded, isSignedIn } = useUser();
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  const { data: planData, isLoading } = useQuery<CurrentPlanResponse>({
    queryKey: ["user-plan"],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_URI}/billing/current`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error("Failed to load current plan");
      }
      return response.json() as Promise<CurrentPlanResponse>;
    },
    enabled: isLoaded && Boolean(isSignedIn)
  })

  const { data: invoicesData, isLoading: isLoadingInvoices } = useQuery<PaymentInvoicesResponse>({
    queryKey: ["payment-invoices"],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_URI}/billing/invoices`, {
        headers: {
          Authorization: `Bearer ${token}`,

        },
      },

      )
      if (!response.ok) {
        throw new Error("Failed to load invoices");
      }
      return response.json() as Promise<PaymentInvoicesResponse>;
    },
    enabled: isLoaded && Boolean(isSignedIn)
  })
  const createPortalSession = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_URI}/billing/portal`,

        {

          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          }
        })
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || "Failed to open billing portal");
      }
      return response.json() as Promise<BillingPortalSessionResponse>
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to open billing portal"
      )
    }
  })

  // Plan details matching the pricing page
  const planDetails = {
    free: {
      name: "Free",
      price: "$0",
      description: "For personal projects and prototypes.",
      cta: "Start Free",
      features: [
        { label: "10k events/month", included: true },
        { label: "7-day retention", included: true },
        { label: "Search your production events", included: true },
        { label: "Full SDK access", included: true },
        { label: "Community support", included: true },
        { label: "Active alerts", included: false },
        { label: "Webhook notifications", included: false },
        { label: "Email support", included: false },

      ],
      logsLimit: "10k events/month",
    },
    starter: {
      name: "Starter",
      price: "$9.99",
      description: "For indie hackers and MVP SaaS products.",
      popular: true,
      cta: "Get Started",
      features: [
        { label: "100k events/month", included: true },
        { label: "30-day retention", included: true },
        { label: "5 active alerts", included: true },
        { label: "Webhook notifications", included: true },
        { label: "Email support", included: true },
        { label: "Full SDK access", included: true },
      ],
      logsLimit: "100k events/month",
    },
    pro: {
      name: "Pro",
      price: "$19.99",
      description: "For growing products with real customers.",
      cta: "Choose Pro",
      features: [
        { label: "500k events/month", included: true },
        { label: "60-day retention", included: true },
        { label: "12 active alerts", included: true },
        { label: "Webhook notifications", included: true },
        { label: "Email support", included: true },
        { label: "Full SDK access", included: true },
      ],
      logsLimit: "500k events/month",
    },
    business: {
      name: "Business",
      price: "29.99",
      description: "For production systems that can't afford downtime.",
      cta: "Choose Business",
      features: [
        { label: "1M events/month", included: true },
        { label: "90-day retention", included: true },
        { label: "20 active alerts", included: true },
        { label: "Webhook notifications", included: true },
        { label: "Email support", included: true },
        { label: "Full SDK access", included: true },
      ],
      logsLimit: "1M events/month",
    },
  };
  type Plankey = keyof typeof planDetails;

  const isPlankey = (plan: unknown): plan is Plankey =>
    typeof plan === "string" && plan in planDetails;

  const currentPlan: Plankey = isPlankey(planData?.plan) ? planData.plan : "free";
  const currentPlanDetails = planDetails[currentPlan];

  // Design tokens for a premium look
  const TOKENS = {
    accent: "#00C2A8",
    border: "rgba(255,255,255,0.08)",
    radius: "12px",
    cardBg:
      "linear-gradient(180deg, rgba(16,20,27,0.92) 0%, rgba(16,20,27,0.78) 100%)",
    shadow: "0 10px 30px rgba(0,0,0,0.45)",
  };
  const createBillingSession = useMutation({
    mutationFn: async (plan: Exclude<Plankey, "free">) => {
      const token = await getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_URI}/billing`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ plan })
        })
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(
          error?.message || "Failed to create the billing session!",
        )
      }
      return response.json() as Promise<BillingSessionResponse>;
    },
    onSuccess: ({ url }) => {
      window.location.href = url
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create billing session")
    }
  })
  // Invoices mock data - dynamic based on plan
  const invoices: any[] = invoicesData?.invoices ?? [];
  function formatInvoiceDate(invoice: PaymentInvoice) {
    const date = invoice.created_at || invoice.period_start;
    if (!date) {
      return "N/A";
    }
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  function formatInvoiceAmount(invoice: PaymentInvoice) {
    const amount = invoice.amount_paid ?? invoice.amount_due ?? 0;
    const currency = invoice.currency || "usd";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  }
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage billing, project configuration, and account preferences.
          </p>
        </div>
      </div>
      {/* Tabs */}
      <Tabs defaultValue="billing" className="w-full">
        <div className="flex items-center justify-between">
          <TabsList className="bg-transparent border-none shadow-none p-0 h-auto rounded-none flex gap-2">
            <TabsTrigger
              value="billing"
              className="px-3 py-2 text-sm font-medium rounded-none border-b-2 border-transparent text-muted-foreground hover:text-white/90 data-[state=active]:text-white data-[state=active]:border-b-[#00C2A8]"
            >
              Billing & Plan
            </TabsTrigger>
            <TabsTrigger
              value="project"
              className="px-3 py-2 text-sm font-medium rounded-none border-b-2 border-transparent text-muted-foreground hover:text-white/90 data-[state=active]:text-white data-[state=active]:border-b-[#00C2A8]"
            >
              Project Settings
            </TabsTrigger>
            <TabsTrigger
              value="account"
              className="px-3 py-2 text-sm font-medium rounded-none border-b-2 border-transparent text-muted-foreground hover:text-white/90 data-[state=active]:text-white data-[state=active]:border-b-[#00C2A8]"
            >
              Account & Security
            </TabsTrigger>
            <TabsTrigger
              value="danger"
              className="px-3 py-2 text-sm font-medium rounded-none border-b-2 border-transparent text-muted-foreground hover:text-white/90 data-[state=active]:text-white data-[state=active]:border-b-[#00C2A8]"
            >
              Danger Zone
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Billing & Plan */}
        <TabsContent value="billing">
          <div
            className="rounded-md border p-6"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${TOKENS.border}`,
              borderRadius: TOKENS.radius,
            }}
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm: items-start sm: justify-between">
                <div>
                  <h3 className="text-sm font-medium">Billing & Plan</h3>
                  <p className="text-sm text-muted-foreground">
                    Manage your subscription and usage securely. All payments are
                    handled via Stripe.
                  </p>
                </div>
                {currentPlan !== 'free' ? (
                  <Button
                    variant="outline"
                    onClick={() => createPortalSession.mutate()}
                    className="h-9.5 rounded-md cursor-pointer border-white/10 bg-white/4 px-4 text-sm text-white/80 hover:bg-white/8">
                    <div className="flex items-center gap-2">
                      <CreditCard />
                      {createPortalSession.isPending ? ("Opening Stripe...") : (
                        <div className="flex items-center gap-2">
                          Manage Billing
                        </div>
                      )}

                    </div>
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
                {
                  (Object.entries(planDetails) as Array<[
                    keyof typeof planDetails,
                    (typeof planDetails)[keyof typeof planDetails]
                  ]>).map(([planKey, plan]) => {
                    const isCurrentPlan = planKey === currentPlan;
                    const isPopular = planData?.plan === "free"
                      ? Boolean("popular" in plan && plan.popular) : false;
                    const isFreePlan = planKey === "free"
                    const isCreatingThisSession = createBillingSession?.isPending && createBillingSession.variables == planKey

                    return (<div key={planKey} className={`flex min-h-107.5 flex-col rounded-xl border p-5 transition-colors hover : border-white/14 ${isPopular ? "border-cyan-400/35400/35" : ""}`}
                      style={{
                        borderColor: isPopular ? "#222" : TOKENS.border,
                      }}>
                      <div>
                        <div className="flex min-h-6 items-center justify-between gap-3">
                          <div
                            className={`text-xs font-semibold uppercase tracking-[O.14em] ${isPopular ? "text-cyan-300" : "text-white/50"
                              }`}
                          >
                            {plan.name}
                          </div>
                          {isPopular ? (<span className="rounded-full border border-cyan-400/35">Popular</span>) : null}
                        </div>
                        <div className="mt-2 flex items-end gap-1">
                          <span className="text-3xl font-semibold tracking-tight text-white">
                            {plan.price}
                          </ span>
                          <span className="pb-1 text-sm text-white/45">
                            /mo
                          </ span>
                        </div>
                        <p className="mt-4 min-h-12 text-sm leading-6 text-white/55">
                          {plan.description}
                        </p>
                      </div>

                      <div className="mt-6 flex-1 space-y-2.5 text-sm">
                        {plan.features.map((feature) => (
                          <div
                            key={feature.label}
                            className={`flex items-center gap-3 ${feature.included
                              ? "text-white/90"
                              : "text-white/60"
                              }`}
                          >
                            <span
                              className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full ${feature.included
                                ? isPopular
                                  ? "bg-cyan-400/10 text-cyan-300"
                                  : "bg-white/8 text-white/80"
                                : "bg-white/8 text-red-300/80"}`}>
                              {feature.included ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                            </span>
                            {feature.label}
                          </div>
                        ))}
                      </div>
                      <Button
                        className={`mt-6 h-10 w-full cursor-pointer rounded-full ${isPopular
                          ? "border border-cyan-400/25 bg-cyan-400/8"
                          : "border border-white/8 bg-white/4 text-white/80"
                          }`}
                        disabled={
                          isCurrentPlan
                          || isFreePlan || isLoading || createBillingSession.isPending}
                        onClick={() => {
                          if (isFreePlan) return;
                          createBillingSession.mutate(planKey);
                        }}

                      >{isCreatingThisSession ? "Generating payment Link..." : isCurrentPlan ? isLoaded ? "Current Plan" : "Loading" : plan.cta}</Button>
                    </div>)
                  })}

              </div>

              {/* Invoices table (polished) */}
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Invoices</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {invoices.length} invoices
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg hover:bg-white/10"
                    >
                      <Download className="h-4 w-4" />
                      Export CSV
                    </Button>
                  </div>
                </div>
                <div
                  className="mt-2 rounded-md border"
                  style={{
                    border: `1px solid ${TOKENS.border}`,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <Table className="min-w-full">
                    <TableHeader>
                      <TableRow className="border-b-[0.5px] border-white/10">
                        <TableHead className="text-xs text-white/60">
                          Invoice ID
                        </TableHead>
                        <TableHead className="text-xs text-white/60">
                          Date
                        </TableHead>
                        <TableHead className="text-xs text-white/60">
                          Amount
                        </TableHead>
                        <TableHead className="text-xs text-white/60">
                          Status
                        </TableHead>
                        <TableHead className="text-xs text-white/60">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingInvoices ? (<TableRow><TableCell colSpan={5} className=" h-24 text-center">Loading invoices ...</TableCell></TableRow>) : (<>{invoices?.length > 0 ? (
                        <>
                          {invoices.map((inv) => (
                            <TableRow
                              key={inv.id}
                              className="group transition-all hover:bg-white/3"
                            >
                              <TableCell className="font-mono text-xs text-white/90">
                                {inv.stripe_invoice_id.slice(0, 8)}...
                              </TableCell>
                              <TableCell className="text-white/80">
                                {formatInvoiceDate(inv)}
                              </TableCell>
                              <TableCell className="text-white/80">
                                {formatInvoiceAmount(inv)}
                              </TableCell>
                              <TableCell>
                                <span
                                  className="text-[11px] px-2 py-0.5 rounded-full border"
                                  style={{
                                    background: "rgba(0,194,168,0.12)",
                                    borderColor: "rgba(0,194,168,0.35)",
                                    color: TOKENS.accent,
                                  }}
                                >
                                  {inv.status}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    const url =
                                      inv?.invoice_pdf ||
                                      inv.hosted_invoice_url;

                                    if (url) {
                                      window.open(
                                        url,
                                        "_blank",
                                        "noopener, noreferrer",)
                                    }
                                  }}
                                  disabled={!inv.invoice_pdf && !inv.hosted_invoice_url}
                                  size="sm"
                                  className="rounded-lg opacity-80 group-hover:opacity-100 hover:bg-[rgba(0,194,168,0.15)]"
                                >
                                  <Download className="h-4 w-4" />
                                  Download PDF
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </>
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center">
                            No invoices available yet!
                          </TableCell>
                        </TableRow>
                      )}</>)}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Project Settings */}
        <TabsContent value="project">
          <div
            className="rounded-md border p-6"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${TOKENS.border}`,
              borderRadius: TOKENS.radius,
            }}
          >
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium">Project Settings</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  View your project configuration details.
                </p>
              </div>

              {/* Clean list-style layout */}
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-white/5">
                  <div>
                    <div className="text-sm font-medium text-white/90">
                      Project Name
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      The name of your project
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-white">
                    Default Project
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-white/5">
                  <div>
                    <div className="text-sm font-medium text-white/90">
                      Region
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Data center location
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-white">
                      US-East-1
                    </div>
                    <div className="text-xs text-muted-foreground">
                      N. Virginia
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium text-white/90">
                      Timezone
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Used for log timestamps
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-white">
                      EST (UTC-5)
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Eastern Standard Time
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Account & Security */}
        <TabsContent value="account">
          <div
            className="rounded-md border p-6"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${TOKENS.border}`,
              borderRadius: TOKENS.radius,
            }}
          >
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium">Account & Security</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  View your account information and current subscription.
                </p>
              </div>

              {/* Clean list-style layout */}
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-white/5">
                  <div>
                    <div className="text-sm font-medium text-white/90">
                      Name
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Your account name
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {user?.fullName || "Not set"}
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-white/5">
                  <div>
                    <div className="text-sm font-medium text-white/90">
                      Email
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Your account email address
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {user?.emailAddresses[0].emailAddress || "Not available"}
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-white/5">
                  <div>
                    <div className="text-sm font-medium text-white/90">
                      Joined
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Account creation date
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {user?.createdAt
                      ? new Date(user.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                      : "Not available"}
                  </div>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium text-white/90">
                      Plan
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Current subscription tier
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white capitalize">
                      {currentPlanDetails.name}
                    </span>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full border capitalize"
                      style={{
                        background: "rgba(0,194,168,0.12)",
                        borderColor: "rgba(0,194,168,0.35)",
                        color: TOKENS.accent,
                      }}
                    >
                      {currentPlan}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Danger Zone */}
        <TabsContent value="danger">
          <div
            className="rounded-md border p-6"
            style={{
              border: "1px solid rgba(248,113,113,0.3)",
              background: "rgba(248,113,113,0.05)",
              borderRadius: "12px",
            }}
          >
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Danger Zone</h3>
              <p className="text-sm text-muted-foreground">
                Deleting your account is irreversible. All data, logs, and API
                keys will be permanently removed after 14 days.
              </p>
              <div className="flex justify-end pt-2">
                <Dialog
                  open={deleteDialogOpen}
                  onOpenChange={setDeleteDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button variant="destructive" className="rounded-md">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Account
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-125">
                    <DialogHeader>
                      <div className="flex items-center gap-3">
                        <div
                          className="rounded-full p-3"
                          style={{
                            background: "rgba(248,113,113,0.15)",
                            border: "1px solid rgba(248,113,113,0.3)",
                          }}
                        >
                          <AlertTriangle className="h-6 w-6 text-red-400" />
                        </div>
                        <div>
                          <DialogTitle className="text-lg font-semibold">
                            Delete Account
                          </DialogTitle>
                        </div>
                      </div>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                        This action cannot be undone. Your account deletion
                        request will be processed with the following timeline:
                      </DialogDescription>

                      <div
                        className="rounded-md border p-4 space-y-3"
                        style={{
                          background: "rgba(248,113,113,0.05)",
                          border: "1px solid rgba(248,113,113,0.2)",
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            <div className="h-2 w-2 rounded-full bg-red-400" />
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-white/90">
                              14-Day Security Hold
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Your account will be marked for deletion and
                              inaccessible immediately. However, for security
                              purposes, all data will be retained for 14 days.
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            <div className="h-2 w-2 rounded-full bg-red-400" />
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-white/90">
                              Complete Data Deletion
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              After 14 days, all account data, logs, API keys,
                              and associated information will be permanently
                              deleted from our systems.
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        If you change your mind within the 14-day period, please
                        contact support to restore your account.
                      </div>
                    </div>
                    <DialogFooter className="gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setDeleteDialogOpen(false)}
                        className="rounded-md hover:bg-black/10"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          console.log("Account deletion requested");
                          setDeleteDialogOpen(false);
                        }}
                        className="rounded-md"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete My Account
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
