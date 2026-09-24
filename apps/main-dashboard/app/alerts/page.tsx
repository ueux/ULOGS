"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus,
  Bell,
  AlertTriangle,
  ChevronDown,
  BellOff,
  Clock,
  FileText,
  Search,
  Loader2,
  X,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { getToken, useUser } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "timeago.js";

type AlertRow = {
  id: string;
  name: string;
  project: string;
  condition: string;
  status: AlertStatus;
  statusNote: string;
  triggerNote: string;
  tone: AlertTone;
  last_triggered: string | null;
};

type BackendAlert = {
  id: string;
  name: string;
  appName: string;
  conditions: {
    field: string;
    operator: string;
    value: string;
  }[];
  threshold_count: number;
  threshold_window_minutes: number;
  webhook_url: string;
  cooldown_period: string;
  summary: string;
  last_triggered: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AlertStatus = "Active" | "Muted";
type AlertTone = "danger" | "warning" | "info";

type RuleCondition = {
  id: number;
  field: string;
  operator: string;
  value: string;
};

type CurrentPlanResponse = {
  plan?: string | null;
};

const toneStyles = {
  danger: {
    accent: "bg-rose-500",
    iconWrap: "bg-rose-500/10 text-rose-400",
    statWrap: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  },
  warning: {
    accent: "bg-amber-400",
    iconWrap: "bg-amber-400/10 text-amber-400",
    statWrap: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  },
  info: {
    accent: "bg-blue-400",
    iconWrap: "bg-blue-500/10 text-blue-400",
    statWrap: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
} satisfies Record<
  AlertTone,
  {
    accent: string;
    iconWrap: string;
    statWrap: string;
  }
>;

const statusStyles = {
  Active: "bg-blue-500/15 text-blue-400",
  Muted: "bg-amber-400/15 text-amber-400",
} satisfies Record<AlertStatus, string>;

const fields = [
  "Type",
  "Message",
  "Importance",
  "Environment",
  "Service",
  "Subsystem",
  "Operation",
];

const operators = ["equals", "does not equal"];

const timeWindows = [
  "1 Minute",
  "5 Minutes",
  "10 Minutes",
  "15 Minutes",
  "1 Hour",
];

const importanceOptions = ["critical", "high", "medium", "low"];

const logTypeOptions = [
  "error",
  "warning",
  "info",
  "debug",
  "success",
  "audit",
  "metric",
];

const cooldownOptions = ["5 minutes", "15 minutes", "30 minutes", "1 hour"];

const freeTextFields = new Set([
  "Message",
  "Service",
  "Subsystem",
  "Operation",
  "Environment",
]);

function parseMinutes(value: string) {
  if (value === "1 Hour") {
    return 60;
  }
  return Number.parseInt(value, 10);
}

function formatTriggeredAt(value: string | null | undefined) {
  if (!value) {
    return "No last triggered";
  }
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "No last triggered";
  }
  return format(date);
}

function AlertGlyph({ tone }: { tone: AlertTone }) {
  const common = "h-4.5 w-4.5";

  if (tone === "warning") {
    return <AlertTriangle className={common} />;
  }

  if (tone === "info") {
    return <span className="text-[15px] font-semibold leading-none">i</span>;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className={common}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12h4l2-7 4 14 2-7h6" />
    </svg>
  );
}

function SelectPill({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`flex h-10 items-center justify-between rounded-xl border border-white/8 bg-[#070d1d]/70 px-3.5 text-sm text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${className ?? ""}`}
    >
      <span>
        {label}: <span className="font-medium text-zinc-100">{value}</span>
      </span>
      <ChevronDown className="ml-7 h-4 w-4 text-zinc-500" />
    </button>
  );
}

function StepNumber({ value }: { value: number }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-medium text-zinc-300">
      {value}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium text-zinc-300">{children}</label>
  );
}

function SelectControl({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-[#070d1d] px-3.5 pr-9 text-sm font-medium text-zinc-100 outline-none transition-colors hover:border-white/16 focus:border-blue-400/50"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
    </div>
  );
}

function TextControl({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={`h-11 w-full rounded-xl border border-white/10 bg-[#070d1d] px-3.5 text-sm font-medium text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 hover:border-white/16 focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
    />
  );
}

function sentenceOperator(operator: string) {
  if (operator === "equals") return "is";
  if (operator === "does not equal") return "is not";
  return operator;
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export default function Page() {
  const { isLoaded, isSignedIn } = useUser();
  const queryClient = useQueryClient();

  const [alertName, setAlertName] = React.useState("");
  const [appName, setAppName] = React.useState("");
  const [webhookUrl, setWebhookUrl] = React.useState("");
  const [verifiedWebhookUrl, setVerifiedWebhookUrl] = React.useState("");
  const [cooldownPeriod, setCooldownPeriod] = React.useState("5 minutes");
  const [isCreatingAlert, setIsCreatingAlert] = React.useState(false);
  const [newAlertOpen, setNewAlertOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [detailAlert, setDetailAlert] = React.useState<AlertRow | null>(null);
  const [threshold, setThreshold] = React.useState("5");
  const [timeWindow, setTimeWindow] = React.useState("5 Minutes");
  const [conditions, setConditions] = React.useState<RuleCondition[]>([
    { id: 1, field: "Type", operator: "equals", value: "error" },
    { id: 2, field: "Importance", operator: "equals", value: "critical" },
  ]);

  const { data: planData } = useQuery<CurrentPlanResponse>({
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
    enabled: isLoaded && Boolean(isSignedIn),
  });

  const { data: alertsData, isLoading: isLoadingAlerts } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_URI}/alerts`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error("Failed to load alerts");
      }
      return response.json() as Promise<BackendAlert[]>;
    },
    enabled: isLoaded && Boolean(isSignedIn),
  });

  const alertRows = React.useMemo<AlertRow[]>(() => {
    return (alertsData ?? []).map((alert) => {
      const hasCritical = alert.conditions.some(
        (condition) =>
          condition.field === "Importance" && condition.value === "critical",
      );
      const hasError = alert.conditions.some(
        (condition) => condition.field === "Type" && condition.value === "error",
      );

      return {
        id: alert.id,
        name: alert.name,
        project: `${alert.appName}`,
        condition: alert.summary,
        status: "Active",
        statusNote: "",
        last_triggered: alert?.last_triggered ?? null,
        triggerNote: `${alert.threshold_count} matching logs within ${alert.threshold_window_minutes} minute${alert.threshold_window_minutes === 1 ? "" : "s"}`,
        tone: hasCritical ? "danger" : hasError ? "warning" : "info",
      };
    });
  }, [alertsData]);

  const filteredAlertRows = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return alertRows;
    }
    return alertRows.filter((alert) =>
      `${alert.name} ${alert.project} ${alert.condition}`
        .toLowerCase()
        .includes(query),
    );
  }, [alertRows, search]);

  const latestLastTriggered = React.useMemo(() => {
    const latest = (alertsData ?? [])
      .map((alert) => alert.last_triggered)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    return latest ? format(latest) : "No last triggered";
  }, [alertsData]);

  const stats = React.useMemo(
    () =>
      [
        {
          label: "Active",
          value: String(alertRows.length),
          caption: "Alerts configured",
          icon: Bell,
          tone: "info",
        },
        {
          label: "Muted",
          value: "0",
          caption: "Temporarily muted",
          icon: BellOff,
          tone: "warning",
        },
        {
          label: "Last Triggered",
          value: latestLastTriggered,
          caption: "Most recent alert",
          icon: Clock,
          tone: "info",
        },
        {
          label: "Total Alerts",
          value: String(alertRows.length),
          caption: "All time",
          icon: FileText,
          tone: "danger",
        },
      ] as const,
    [alertRows.length, latestLastTriggered],
  );

  const handleNewAlertClick = () => {
    if (planData?.plan === "free") {
      toast.error("Please upgrade your plan for creating alert!");
      return;
    }
    setNewAlertOpen(true);
  };

  const updateCondition = (
    id: number,
    key: keyof Omit<RuleCondition, "id">,
    value: string,
  ) => {
    setConditions((current) =>
      current.map((condition) => {
        if (condition.id !== id) {
          return condition;
        }
        if (key === "field") {
          return {
            ...condition,
            field: value,
            operator: operators.includes(condition.operator)
              ? condition.operator
              : operators[0],
            value:
              value === "Importance"
                ? "critical"
                : value === "Type"
                  ? "error"
                  : "",
          };
        }
        return { ...condition, [key]: value };
      }),
    );
  };

  const addCondition = () => {
    setConditions((current) => [
      ...current,
      {
        id: Date.now(),
        field: "Message",
        operator: "equals",
        value: "",
      },
    ]);
  };

  const removeCondition = (id: number) => {
    setConditions((current) =>
      current.length > 1
        ? current.filter((condition) => condition.id !== id)
        : current,
    );
  };

  const ruleSummary = React.useMemo(() => {
    const readableConditions = conditions
      .map((condition) => {
        const value = freeTextFields.has(condition.field)
          ? `'${condition.value || "..."}'`
          : condition.value || "...";

        return `${condition.field} ${sentenceOperator(condition.operator)} ${value}`;
      })
      .join(" and ");

    const appCondition = `App Name is '${appName || "..."}'`;

    return `This alert will trigger when ${appCondition} and ${readableConditions} at least ${threshold || "..."} times within ${timeWindow.toLowerCase()}`;
  }, [appName, conditions, threshold, timeWindow]);

  const newAlertFormValue = React.useMemo(
    () => ({
      name: alertName,
      appName,
      conditions: conditions.map(({ field: conditionField, operator, value }) => ({
        field: conditionField,
        operator,
        value,
      })),
      threshold: {
        count: Number(threshold) || 0,
        windowMinutes: parseMinutes(timeWindow),
      },
      webhook: {
        url: webhookUrl,
      },
      cooldownPeriod,
      summary: ruleSummary,
    }),
    [
      alertName,
      appName,
      conditions,
      cooldownPeriod,
      ruleSummary,
      threshold,
      timeWindow,
      webhookUrl,
    ],
  );

  const resetNewAlertForm = () => {
    setAlertName("");
    setAppName("");
    setWebhookUrl("");
    setVerifiedWebhookUrl("");
    setCooldownPeriod("5 minutes");
    setThreshold("5");
    setTimeWindow("5 Minutes");
    setConditions([
      { id: 1, field: "Type", operator: "equals", value: "error" },
      {
        id: 2,
        field: "Importance",
        operator: "equals",
        value: "critical",
      },
    ]);
  };

  const handleWebhookUrlChange = (value: string) => {
    setWebhookUrl(value);
    setVerifiedWebhookUrl("");
  };
 
  const handleVerifyWebhook = () => {
    const url = webhookUrl.trim();
    if (!url) {
      return toast.error("Enter a webhook URL first");
    }
    if (!isValidUrl(url)) {
      return toast.error("Webhook URL must be a valid URL");
    }
    const { protocol } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") {
      return toast.error("Webhook URL must use http or https");
    }
    setVerifiedWebhookUrl(url);
    toast.success("Webhook URL verified");
  };

  const createAlertHandler = async () => {
    if (!newAlertFormValue.name.trim()) {
      return toast.error("Alert name is required");
    }
    if (!newAlertFormValue.appName.trim()) {
      return toast.error("App Name is required");
    }
    if (newAlertFormValue.conditions.some((condition) => !condition.value.trim())) {
      return toast.error("Every condition needs a value");
    }
    if (!newAlertFormValue.webhook.url.trim()) {
      return toast.error("Webhook URL is required");
    }
    if (!isValidUrl(newAlertFormValue.webhook.url)) {
      return toast.error("Webhook URL must be a valid URL");
    }
    if (verifiedWebhookUrl !== newAlertFormValue.webhook.url.trim()) {
      return toast.error("Please verify the webhook URL first");
    }
    if (newAlertFormValue.threshold.count < 1) {
      return toast.error("Threshold count must be at least 1");
    }
    setIsCreatingAlert(true);
    try {
      const token = await getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_URI}/alerts`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(newAlertFormValue),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(
          error?.message ?? "Failed to create alert. Please try again.",
        );
      }
      toast.success("Alert created successfully");
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      setNewAlertOpen(false);
      resetNewAlertForm();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create alert. Please try again.",
      );
    } finally {
      setIsCreatingAlert(false);
    }
  };

  return (
    <>
      <div className="space-y-4 pb-2">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
            <p className="text-sm text-muted-foreground">
              Monitor and manage active log-based alerts.
            </p>
          </div>
          <Button
            className="mt-0.5 h-9 cursor-pointer rounded-full bg-blue-500 px-4 text-sm font-medium text-white shadow-[0_0_18px_rgb(59,130,246,0.35)] hover:bg-blue-400"
            onClick={handleNewAlertClick}
          >
            <Plus className="h-4 w-4" />
            New Alert
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="relative overflow-hidden rounded-[13px] border border-white/8 bg-[linear-gradient(180deg,rgb(13,20,40,0.78),rgb(7,12,27,0.68))] p-6 pr-18 shadow-[inset_0_1px_0_rgb(255,255,255,0.025)]"
            >
              <div className={`absolute left-0 top-0 h-full w-[3px] ${toneStyles[stat.tone].accent}`} />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-zinc-400">
                    {stat.label}
                  </p>
                  <div
                    className={`mt-2 font-semibold leading-none tracking-tight text-zinc-50 ${stat.label === "Last Triggered" ? "text-xl" : "text-3xl"}`}
                  >
                    {stat.value}
                  </div>
                  <p className="mt-3 text-sm text-zinc-500">{stat.caption}</p>
                </div>
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${toneStyles[stat.tone].statWrap}`}
                >
                  <stat.icon className="h-4.5 w-4.5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 pt-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 lg:flex-row">
            <div className="relative h-10 flex-1 lg:max-w-82.5">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                aria-label="Search alerts"
                placeholder="Search alerts ..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-full w-full rounded-xl border border-white/8 bg-[#070d1d]/70 pl-10 pr-3.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 hover:border-white/16 focus:border-blue-400/50"
              />
            </div>
            <SelectPill label="Status" value="All" className="lg:w-42.5" />
            <SelectPill label="Projects" value="All" className="lg:w-42.5" />
            <SelectPill label="Sort" value="Newest" className="lg:w-40" />
          </div>
        </div>

        {/* Alerts table */}
        <div className="overflow-hidden rounded-xl border border-white/8 bg-[#050b1b]/55 shadow-[inset_0_1px_0_rgb(255,255,255,0.025)]">
          <div className="grid grid-cols-[minmax(390px,1.4fr)_220px_240px_190px] border-b border-white/8 px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            <div>Alert</div>
            <div>Status</div>
            <div>Last Triggered</div>
            <div>Actions</div>
          </div>

          {isLoadingAlerts ? (
            <div className="flex min-h-50 items-center justify-center text-sm text-zinc-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading alerts ...
            </div>
          ) : filteredAlertRows.length === 0 ? (
            <div className="flex min-h-50 flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400">
                <Bell className="h-5 w-5" />
              </div>
              <div className="text-sm font-semibold text-zinc-100">
                {alertRows.length === 0
                  ? "No alerts created yet"
                  : "No alerts match your search"}
              </div>
              <p className="mt-2 max-w-sm text-sm text-zinc-500">
                {alertRows.length === 0
                  ? "Create your first alert to get notified when important log patterns show up in production."
                  : "Try a different search term to find the alert you are looking for."}
              </p>
            </div>
          ) : (
            filteredAlertRows.map((alert) => (
              <div
                key={alert.id}
                className="relative grid min-h-24.5 grid-cols-[minmax(390px,1.4fr)_220px_240px_190px] items-center border-b border-white/8 px-6 last:border-b-0"
              >
                <div
                  className={`absolute left-0 top-1.5 h-[calc(100%-12px)] w-[3px] ${toneStyles[alert.tone].accent}`}
                />
                <div className="flex items-center gap-4 py-4">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneStyles[alert.tone].iconWrap}`}
                  >
                    <AlertGlyph tone={alert.tone} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-zinc-50">
                      {alert.name}
                    </div>
                    <div className="mt-1 text-sm text-zinc-400">
                      Project Name: {alert.project}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {alert.condition}
                    </div>
                  </div>
                </div>
                <div className="py-4">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${statusStyles[alert.status]}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${toneStyles[alert.tone].accent}`}
                    />
                    {alert.status}
                    {alert.status === "Muted" ? (
                      <BellOff className="h-3.5 w-3.5" />
                    ) : null}
                  </span>
                  <p className="mt-2 text-xs text-zinc-500">
                    {alert.triggerNote}
                  </p>
                </div>
                <div className="py-4 text-sm text-zinc-300">
                  {formatTriggeredAt(alert.last_triggered)}
                </div>
                <div className="flex items-center justify-end gap-2 py-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer rounded-xl text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                    onClick={() => setDetailAlert(alert)}
                  >
                    Details
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* New Alert Modal */}
        <Dialog open={newAlertOpen} onOpenChange={setNewAlertOpen}>
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-120">
            <DialogHeader>
              <DialogTitle>Create New Alert</DialogTitle>
              <DialogDescription>
                Configure a new alert. It will be triggered when the condition
                matches.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Step 1: basics */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <StepNumber value={1} />
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Alert basics
                  </h3>
                </div>
                <div className="grid gap-3 pl-11 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel>Alert Name</FieldLabel>
                    <TextControl
                      value={alertName}
                      onChange={setAlertName}
                      placeholder="e.g. Checkout errors spike"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>App Name</FieldLabel>
                    <TextControl
                      value={appName}
                      onChange={setAppName}
                      placeholder="e.g. payments-service"
                    />
                  </div>
                </div>
              </div>

              {/* Step 2: conditions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <StepNumber value={2} />
                    <h3 className="text-sm font-semibold text-zinc-100">
                      When these conditions match
                    </h3>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer rounded-xl text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                    onClick={addCondition}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add condition
                  </Button>
                </div>
                <div className="space-y-2.5 pl-11">
                  {conditions.map((condition) => (
                    <div
                      key={condition.id}
                      className="grid grid-cols-[1fr_1fr_1.2fr_auto] items-center gap-2"
                    >
                      <SelectControl
                        value={condition.field}
                        onChange={(value) =>
                          updateCondition(condition.id, "field", value)
                        }
                      >
                        {fields.map((field) => (
                          <option key={field} value={field}>
                            {field}
                          </option>
                        ))}
                      </SelectControl>
                      <SelectControl
                        value={condition.operator}
                        onChange={(value) =>
                          updateCondition(condition.id, "operator", value)
                        }
                      >
                        {operators.map((operator) => (
                          <option key={operator} value={operator}>
                            {operator}
                          </option>
                        ))}
                      </SelectControl>
                      {condition.field === "Importance" ? (
                        <SelectControl
                          value={condition.value}
                          onChange={(value) =>
                            updateCondition(condition.id, "value", value)
                          }
                        >
                          {importanceOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </SelectControl>
                      ) : condition.field === "Type" ? (
                        <SelectControl
                          value={condition.value}
                          onChange={(value) =>
                            updateCondition(condition.id, "value", value)
                          }
                        >
                          {logTypeOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </SelectControl>
                      ) : (
                        <TextControl
                          value={condition.value}
                          onChange={(value) =>
                            updateCondition(condition.id, "value", value)
                          }
                          placeholder="Value to match"
                        />
                      )}
                      <button
                        type="button"
                        aria-label="Remove condition"
                        disabled={conditions.length === 1}
                        onClick={() => removeCondition(condition.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 3: threshold */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <StepNumber value={3} />
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Threshold and window
                  </h3>
                </div>
                <div className="grid gap-3 pl-11 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel>Matching logs</FieldLabel>
                    <TextControl
                      value={threshold}
                      onChange={(value) =>
                        setThreshold(value.replace(/[^0-9]/g, ""))
                      }
                      placeholder="e.g. 5"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Within</FieldLabel>
                    <SelectControl value={timeWindow} onChange={setTimeWindow}>
                      {timeWindows.map((window) => (
                        <option key={window} value={window}>
                          {window}
                        </option>
                      ))}
                    </SelectControl>
                  </div>
                </div>
              </div>

              {/* Step 4: webhook and cooldown */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <StepNumber value={4} />
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Webhook and cooldown
                  </h3>
                </div>
                <div className="space-y-3 pl-11">
                  <div className="space-y-1.5">
                    <FieldLabel>Webhook URL</FieldLabel>
                    <div className="flex gap-2">
                      <TextControl
                        value={webhookUrl}
                        onChange={handleWebhookUrlChange}
                        placeholder="https://hooks.example.com/alerts"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 shrink-0 cursor-pointer rounded-xl border-white/10 text-zinc-200 hover:bg-white/5"
                        onClick={handleVerifyWebhook}
                      >
                        Verify
                      </Button>
                    </div>
                    {verifiedWebhookUrl && verifiedWebhookUrl === webhookUrl.trim() ? (
                      <p className="flex items-center gap-1.5 text-xs text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Webhook URL verified
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-500">
                        Verify the URL before creating the alert.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Cooldown period</FieldLabel>
                    <SelectControl
                      value={cooldownPeriod}
                      onChange={setCooldownPeriod}
                    >
                      {cooldownOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </SelectControl>
                  </div>
                </div>
              </div>

              {/* Rule summary */}
              <div className="rounded-xl border border-blue-400/20 bg-blue-500/5 p-4 text-sm leading-relaxed text-zinc-300">
                {ruleSummary}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  className="cursor-pointer rounded-xl"
                  onClick={() => setNewAlertOpen(false)}
                  disabled={isCreatingAlert}
                >
                  Cancel
                </Button>
                <Button
                  className="cursor-pointer rounded-xl bg-blue-500 text-white hover:bg-blue-400 disabled:cursor-not-allowed"
                  onClick={createAlertHandler}
                  disabled={isCreatingAlert}
                >
                  {isCreatingAlert ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating ...
                    </>
                  ) : (
                    "Create Alert"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Alert details modal */}
        <Dialog
          open={Boolean(detailAlert)}
          onOpenChange={(open) => {
            if (!open) {
              setDetailAlert(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-120">
            <DialogHeader>
              <DialogTitle>{detailAlert?.name ?? "Alert details"}</DialogTitle>
              <DialogDescription>
                {detailAlert
                  ? `Project: ${detailAlert.project}`
                  : "No alert selected."}
              </DialogDescription>
            </DialogHeader>
            {detailAlert ? (
              <div className="space-y-4 text-sm">
                <div className="space-y-1.5">
                  <FieldLabel>Rule summary</FieldLabel>
                  <p className="rounded-xl border border-white/10 bg-[#070d1d] p-3 leading-relaxed text-zinc-300">
                    {detailAlert.condition}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel>Status</FieldLabel>
                    <p className="text-zinc-200">
                      {detailAlert.status} · {detailAlert.triggerNote}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Last triggered</FieldLabel>
                    <p className="text-zinc-200">
                      {formatTriggeredAt(detailAlert.last_triggered)}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    variant="ghost"
                    className="cursor-pointer rounded-xl"
                    onClick={() => setDetailAlert(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Footer status bar */}
        <div
          className="flex items-center justify-between rounded-xl border px-3 py-2 text-xs"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div className="flex items-center gap-6">
            <span className="text-muted-foreground">Active</span>
            <span className="font-medium">{alertRows.length}</span>
            <span className="text-muted-foreground">Muted</span>
            <span className="font-medium">0</span>
            <span className="text-muted-foreground">Last Triggered</span>
            <span className="font-medium">{latestLastTriggered}</span>
            <span className="text-muted-foreground">Resolved</span>
            <span className="font-medium">0</span>
          </div>
          <span className="text-muted-foreground">
            {alertsData?.length ?? 0} alert{(alertsData?.length ?? 0) === 1 ? "" : "s"} total
          </span>
        </div>
      </div>
    </>
  );
}
