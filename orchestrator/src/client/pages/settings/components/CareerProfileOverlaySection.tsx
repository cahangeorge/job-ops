import * as api from "@client/api";
import { SettingsSectionFrame } from "@client/pages/settings/components/SettingsSectionFrame";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type CareerProfileOverlaySectionProps = {
  layoutMode?: "accordion" | "panel";
};

function linesToValues(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function valuesToLines(values?: string[]): string {
  return values?.join("\n") ?? "";
}

export const CareerProfileOverlaySection: React.FC<
  CareerProfileOverlaySectionProps
> = ({ layoutMode }) => {
  const queryClient = useQueryClient();
  const overlayQuery = useQuery({
    queryKey: ["profile", "overlay"],
    queryFn: api.getCareerProfileOverlay,
  });
  const [roles, setRoles] = useState("");
  const [locations, setLocations] = useState("");
  const [companies, setCompanies] = useState("");
  const [excludedCompanies, setExcludedCompanies] = useState("");
  const [minimumSalary, setMinimumSalary] = useState("");
  const [requiresVisaSponsorship, setRequiresVisaSponsorship] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const overlay = overlayQuery.data;
    if (!overlay) return;
    setRoles(valuesToLines(overlay.preferences.roles));
    setLocations(valuesToLines(overlay.preferences.locations));
    setCompanies(valuesToLines(overlay.targets.companies));
    setExcludedCompanies(valuesToLines(overlay.constraints.excludedCompanies));
    setMinimumSalary(
      overlay.constraints.minimumSalary === undefined
        ? ""
        : String(overlay.constraints.minimumSalary),
    );
    setRequiresVisaSponsorship(
      overlay.constraints.requiresVisaSponsorship ?? false,
    );
    setNote(overlay.provenance.note ?? "");
  }, [overlayQuery.data]);

  const saveMutation = useMutation({
    mutationFn: api.updateCareerProfileOverlay,
    onSuccess: (overlay) => {
      setError(null);
      queryClient.setQueryData(["profile", "overlay"], overlay);
    },
    onError: (saveError) => {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save career preferences.",
      );
    },
  });

  const resetMutation = useMutation({
    mutationFn: api.resetCareerProfileOverlay,
    onSuccess: () => {
      setError(null);
      queryClient.setQueryData(["profile", "overlay"], null);
      setRoles("");
      setLocations("");
      setCompanies("");
      setExcludedCompanies("");
      setMinimumSalary("");
      setRequiresVisaSponsorship(false);
      setNote("");
    },
    onError: (resetError) => {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Unable to reset career preferences.",
      );
    },
  });

  const isSaving = saveMutation.isPending || resetMutation.isPending;
  const save = () => {
    const parsedMinimumSalary = minimumSalary.trim()
      ? Number(minimumSalary)
      : undefined;
    if (
      parsedMinimumSalary !== undefined &&
      (!Number.isInteger(parsedMinimumSalary) || parsedMinimumSalary < 0)
    ) {
      setError("Minimum salary must be a whole, non-negative number.");
      return;
    }
    saveMutation.mutate({
      expectedUpdatedAt: overlayQuery.data?.updatedAt ?? null,
      preferences: {
        roles: linesToValues(roles),
        locations: linesToValues(locations),
      },
      targets: { companies: linesToValues(companies) },
      constraints: {
        ...(parsedMinimumSalary === undefined
          ? {}
          : { minimumSalary: parsedMinimumSalary }),
        requiresVisaSponsorship,
        excludedCompanies: linesToValues(excludedCompanies),
      },
      provenance: {
        source: "manual",
        ...(note.trim() ? { note: note.trim() } : {}),
      },
    });
  };

  const reset = () => {
    const updatedAt = overlayQuery.data?.updatedAt;
    if (!updatedAt) return;
    if (!window.confirm("Reset all career preferences for this workspace?"))
      return;
    resetMutation.mutate(updatedAt);
  };

  return (
    <SettingsSectionFrame
      mode={layoutMode}
      title="Career preferences overlay"
      value="career-profile"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          These workspace preferences supplement your resume; they never edit
          your source profile or resume.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <label
            className="space-y-2 text-sm font-medium"
            htmlFor="career-overlay-roles"
          >
            Preferred roles
            <Textarea
              id="career-overlay-roles"
              value={roles}
              onChange={(event) => setRoles(event.target.value)}
              maxLength={2420}
              placeholder="Platform Engineer, Staff Engineer"
              disabled={isSaving}
            />
          </label>
          <label
            className="space-y-2 text-sm font-medium"
            htmlFor="career-overlay-locations"
          >
            Preferred locations
            <Textarea
              id="career-overlay-locations"
              value={locations}
              onChange={(event) => setLocations(event.target.value)}
              maxLength={2420}
              placeholder="Berlin, Remote"
              disabled={isSaving}
            />
          </label>
          <label
            className="space-y-2 text-sm font-medium"
            htmlFor="career-overlay-companies"
          >
            Target companies
            <Textarea
              id="career-overlay-companies"
              value={companies}
              onChange={(event) => setCompanies(event.target.value)}
              maxLength={2420}
              placeholder="One company per line"
              disabled={isSaving}
            />
          </label>
          <label
            className="space-y-2 text-sm font-medium"
            htmlFor="career-overlay-excluded-companies"
          >
            Excluded companies
            <Textarea
              id="career-overlay-excluded-companies"
              value={excludedCompanies}
              onChange={(event) => setExcludedCompanies(event.target.value)}
              maxLength={2420}
              placeholder="One company per line"
              disabled={isSaving}
            />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label
            className="space-y-2 text-sm font-medium"
            htmlFor="career-overlay-minimum-salary"
          >
            Minimum annual salary
            <Input
              id="career-overlay-minimum-salary"
              type="number"
              min={0}
              max={1000000}
              value={minimumSalary}
              onChange={(event) => setMinimumSalary(event.target.value)}
              disabled={isSaving}
            />
          </label>
          <div className="flex items-center gap-3 pt-7">
            <Checkbox
              id="career-overlay-visa"
              checked={requiresVisaSponsorship}
              onCheckedChange={(value) =>
                setRequiresVisaSponsorship(value === true)
              }
              disabled={isSaving}
            />
            <label
              htmlFor="career-overlay-visa"
              className="text-sm font-medium"
            >
              Requires visa sponsorship
            </label>
          </div>
        </div>
        <label
          className="space-y-2 text-sm font-medium"
          htmlFor="career-overlay-note"
        >
          Preference note
          <Textarea
            id="career-overlay-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="Optional context for these preferences"
            disabled={isSaving}
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={save}
            disabled={isSaving || overlayQuery.isLoading}
          >
            Save career preferences
          </Button>
          {overlayQuery.data ? (
            <Button
              type="button"
              variant="outline"
              onClick={reset}
              disabled={isSaving}
            >
              Reset overlay
            </Button>
          ) : null}
        </div>
      </div>
    </SettingsSectionFrame>
  );
};
