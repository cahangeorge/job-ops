# React → SvelteKit Component Mapping

## Overview

This document maps existing React components to their SvelteKit equivalents. All components are being migrated from React 18 + Tailwind CSS 4 + Radix UI to Svelte 5 + shadcn-svelte + Tailwind CSS v4.

## Shared Components

| React Component | SvelteKit Equivalent | Notes |
|----------------|---------------------|-------|
| `StatusBadge` | `StatusBadge.svelte` | Direct port, same props |
| `ScoreRing` | `ScoreRing.svelte` | Direct port, use SVG |
| `ScoreIndicator` | `ScoreIndicator.svelte` | Direct port |
| `PipelineProgress` | `PipelineProgress.svelte` | Direct port, add SSE reactivity |
| `StatusIndicator` | `StatusIndicator.svelte` | Direct port |
| `LoadingSpinner` | `LoadingSpinner.svelte` | Direct port |
| `ConfirmDialog` | `ConfirmDialog.svelte` | Use shadcn Dialog |
| `ErrorBoundary` | `+error.svelte` | SvelteKit error handling |
| `AnimatedNumber` | `AnimatedNumber.svelte` | Use Svelte transitions |
| `AnimatedCard` | `AnimatedCard.svelte` | Use Svelte transitions |
| `AnimatedIcon` | `AnimatedIcon.svelte` | Use Svelte transitions |
| `Confetti` | `Confetti.svelte` | Use canvas or CSS |
| `LottieAnimation` | `LottieAnimation.svelte` | Use dotlottie-svelte |
| `ConfettiExplosion` | `ConfettiExplosion.svelte` | Use canvas or CSS |

## Layout Components

| React Component | SvelteKit Equivalent | Notes |
|----------------|---------------------|-------|
| `AppLayout` | `+layout.svelte` | Main layout with sidebar |
| `Sidebar` | `Sidebar.svelte` | Use shadcn Sheet for mobile |
| `Header` | `Header.svelte` | Use shadcn Navigation |
| `Breadcrumb` | `Breadcrumb.svelte` | Use shadcn Breadcrumb |
| `NavigationMenu` | `NavigationMenu.svelte` | Use shadcn NavigationMenu |

## Form Components

| React Component | SvelteKit Equivalent | Notes |
|----------------|---------------------|-------|
| `Input` | `Input.svelte` | Use shadcn Input |
| `Button` | `Button.svelte` | Use shadcn Button |
| `Select` | `Select.svelte` | Use shadcn Select |
| `Checkbox` | `Checkbox.svelte` | Use shadcn Checkbox |
| `RadioGroup` | `RadioGroup.svelte` | Use shadcn RadioGroup |
| `Switch` | `Switch.svelte` | Use shadcn Switch |
| `Textarea` | `Textarea.svelte` | Use shadcn Textarea |
| `Label` | `Label.svelte` | Use shadcn Label |
| `Form` | `Form.svelte` | Use SuperForms |
| `FormField` | `FormField.svelte` | Use SuperForms |
| `FormItem` | `FormItem.svelte` | Use SuperForms |
| `FormLabel` | `FormLabel.svelte` | Use SuperForms |
| `FormControl` | `FormControl.svelte` | Use SuperForms |
| `FormDescription` | `FormDescription.svelte` | Use SuperForms |
| `FormMessage` | `FormMessage.svelte` | Use SuperForms |

## Data Display Components

| React Component | SvelteKit Equivalent | Notes |
|----------------|---------------------|-------|
| `Table` | `Table.svelte` | Use shadcn Table |
| `TableRow` | `TableRow.svelte` | Use shadcn Table |
| `TableCell` | `TableCell.svelte` | Use shadcn Table |
| `TableHeader` | `TableHeader.svelte` | Use shadcn Table |
| `TableBody` | `TableBody.svelte` | Use shadcn Table |
| `Card` | `Card.svelte` | Use shadcn Card |
| `CardContent` | `CardContent.svelte` | Use shadcn Card |
| `CardHeader` | `CardHeader.svelte` | Use shadcn Card |
| `CardTitle` | `CardTitle.svelte` | Use shadcn Card |
| `CardDescription` | `CardDescription.svelte` | Use shadcn Card |
| `Badge` | `Badge.svelte` | Use shadcn Badge |
| `Avatar` | `Avatar.svelte` | Use shadcn Avatar |
| `AvatarImage` | `AvatarImage.svelte` | Use shadcn Avatar |
| `AvatarFallback` | `AvatarFallback.svelte` | Use shadcn Avatar |

## Overlay Components

| React Component | SvelteKit Equivalent | Notes |
|----------------|---------------------|-------|
| `Dialog` | `Dialog.svelte` | Use shadcn Dialog |
| `DialogTrigger` | `DialogTrigger.svelte` | Use shadcn Dialog |
| `DialogContent` | `DialogContent.svelte` | Use shadcn Dialog |
| `DialogHeader` | `DialogHeader.svelte` | Use shadcn Dialog |
| `DialogTitle` | `DialogTitle.svelte` | Use shadcn Dialog |
| `DialogDescription` | `DialogDescription.svelte` | Use shadcn Dialog |
| `DialogFooter` | `DialogFooter.svelte` | Use shadcn Dialog |
| `Sheet` | `Sheet.svelte` | Use shadcn Sheet |
| `SheetTrigger` | `SheetTrigger.svelte` | Use shadcn Sheet |
| `SheetContent` | `SheetContent.svelte` | Use shadcn Sheet |
| `Popover` | `Popover.svelte` | Use shadcn Popover |
| `PopoverTrigger` | `PopoverTrigger.svelte` | Use shadcn Popover |
| `PopoverContent` | `PopoverContent.svelte` | Use shadcn Popover |
| `DropdownMenu` | `DropdownMenu.svelte` | Use shadcn DropdownMenu |
| `DropdownMenuTrigger` | `DropdownMenuTrigger.svelte` | Use shadcn DropdownMenu |
| `DropdownMenuContent` | `DropdownMenuContent.svelte` | Use shadcn DropdownMenu |
| `DropdownMenuItem` | `DropdownMenuItem.svelte` | Use shadcn DropdownMenu |
| `Tooltip` | `Tooltip.svelte` | Use shadcn Tooltip |
| `TooltipTrigger` | `TooltipTrigger.svelte` | Use shadcn Tooltip |
| `TooltipContent` | `TooltipContent.svelte` | Use shadcn Tooltip |

## Navigation Components

| React Component | SvelteKit Equivalent | Notes |
|----------------|---------------------|-------|
| `Tabs` | `Tabs.svelte` | Use shadcn Tabs |
| `TabsList` | `TabsList.svelte` | Use shadcn Tabs |
| `TabsTrigger` | `TabsTrigger.svelte` | Use shadcn Tabs |
| `TabsContent` | `TabsContent.svelte` | Use shadcn Tabs |
| `Accordion` | `Accordion.svelte` | Use shadcn Accordion |
| `AccordionItem` | `AccordionItem.svelte` | Use shadcn Accordion |
| `AccordionTrigger` | `AccordionTrigger.svelte` | Use shadcn Accordion |
| `AccordionContent` | `AccordionContent.svelte` | Use shadcn Accordion |
| `NavigationMenu` | `NavigationMenu.svelte` | Use shadcn NavigationMenu |
| `NavigationMenuList` | `NavigationMenuList.svelte` | Use shadcn NavigationMenu |
| `NavigationMenuItem` | `NavigationMenuItem.svelte` | Use shadcn NavigationMenu |
| `NavigationMenuLink` | `NavigationMenuLink.svelte` | Use shadcn NavigationMenu |

## Chart Components

| React Component | SvelteKit Equivalent | Notes |
|----------------|---------------------|-------|
| `JobStatusPieChart` | `JobStatusPieChart.svelte` | Use LayerChart PieChart |
| `JobsOverTimeChart` | `JobsOverTimeChart.svelte` | Use LayerChart LineChart |
| `EmployerBarChart` | `EmployerBarChart.svelte` | Use LayerChart BarChart |
| `ApplicationStatusChart` | `ApplicationStatusChart.svelte` | Use LayerChart PieChart |
| `ApplicationsOverTimeChart` | `ApplicationsOverTimeChart.svelte` | Use LayerChart LineChart |
| `SalaryDistributionChart` | `SalaryDistributionChart.svelte` | Use LayerChart BarChart |
| `PipelineStepProgress` | `PipelineStepProgress.svelte` | Use LayerChart Progress |
| `PipelineStepTrendChart` | `PipelineStepTrendChart.svelte` | Use LayerChart LineChart |
| `JobScoreTrendChart` | `JobScoreTrendChart.svelte` | Use LayerChart LineChart |
| `ResumeMatchDonut` | `ResumeMatchDonut.svelte` | Use LayerChart PieChart |

## Feature-Specific Components

### Job Page
| React Component | SvelteKit Equivalent | Notes |
|----------------|---------------------|-------|
| `JobPage` | `+page.svelte` | Main job detail page |
| `JobPageHeader` | `JobPageHeader.svelte` | Job title, company, status |
| `JobOverviewSection` | `JobOverviewSection.svelte` | Job summary |
| `JobDescriptionSection` | `JobDescriptionSection.svelte` | Full description |
| `JobSkillsSection` | `JobSkillsSection.svelte` | Skills match display |
| `JobTailorSection` | `JobTailorSection.svelte` | Tailoring interface |
| `JobPdfSection` | `JobPdfSection.svelte` | PDF preview |
| `JobApplicationSection` | `JobApplicationSection.svelte` | Application tracking |
| `JobEvaluationSection` | `JobEvaluationSection.svelte` | A-G evaluation display |

### Dashboard
| React Component | SvelteKit Equivalent | Notes |
|----------------|---------------------|-------|
| `HomePage` | `+page.svelte` | Main dashboard |
| `StatsOverview` | `StatsOverview.svelte` | Key metrics |
| `RecentJobs` | `RecentJobs.svelte` | Latest jobs |
| `PipelineStatus` | `PipelineStatus.svelte` | Pipeline overview |
| `QuickActions` | `QuickActions.svelte` | Common actions |

### Orchestrator
| React Component | SvelteKit Equivalent | Notes |
|----------------|---------------------|-------|
| `OrchestratorPage` | `+page.svelte` | Pipeline control |
| `PipelineControls` | `PipelineControls.svelte` | Start/stop pipeline |
| `ExtractorSelector` | `ExtractorSelector.svelte` | Choose extractors |
| `PipelineHistory` | `PipelineHistory.svelte` | Past runs |
| `PipelineProgress` | `PipelineProgress.svelte` | Real-time progress |

### Settings
| React Component | SvelteKit Equivalent | Notes |
|----------------|---------------------|-------|
| `SettingsPage` | `+page.svelte` | Settings hub |
| `GeneralSettings` | `GeneralSettings.svelte` | General preferences |
| `ApiKeysSettings` | `ApiKeysSettings.svelte` | API key management |
| `NotificationSettings` | `NotificationSettings.svelte` | Notification prefs |
| `AppearanceSettings` | `AppearanceSettings.svelte` | Theme settings |

### New Feature Components (Phase 4)
| React Component | SvelteKit Equivalent | Notes |
|----------------|---------------------|-------|
| `EvaluationDashboard` | `EvaluationDashboard.svelte` | A-G evaluation UI |
| `BlockResultCard` | `BlockResultCard.svelte` | Individual block display |
| `EvaluationProgress` | `EvaluationProgress.svelte` | SSE progress tracking |
| `StoryBankView` | `StoryBankView.svelte` | Story list/editor |
| `StoryEditor` | `StoryEditor.svelte` | Story creation/editing |
| `InterviewPrepView` | `InterviewPrepView.svelte` | Prep pack display |
| `InterviewPrepGenerator` | `InterviewPrepGenerator.svelte` | Pack generation |
| `WritingStyleCalibrator` | `WritingStyleCalibrator.svelte` | Style calibration |
| `LegitimacyScoreCard` | `LegitimacyScoreCard.svelte` | Score display |

---

## Component Migration Strategy

### Step 1: Create SvelteKit Components
1. Create `src/lib/components/` directory
2. Install shadcn-svelte components
3. Create custom components matching React equivalents
4. Use Svelte 5 runes for reactivity

### Step 2: Port Props Interface
React:
```tsx
interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}
```

Svelte:
```svelte
<script lang="ts">
  interface Props {
    status: string;
    size?: 'sm' | 'md' | 'lg';
    class?: string;
  }
  let { status, size = 'md', class: className }: Props = $props();
</script>
```

### Step 3: Port State Management
React:
```tsx
const [count, setCount] = useState(0);
const doubled = useMemo(() => count * 2, [count]);
```

Svelte:
```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```

### Step 4: Port Side Effects
React:
```tsx
useEffect(() => {
  // side effect
  return () => cleanup();
}, [dependency]);
```

Svelte:
```svelte
<script lang="ts">
  $effect(() => {
    // side effect
    return () => cleanup();
  });
</script>
```

### Step 5: Port Event Handlers
React:
```tsx
const handleClick = (e: React.MouseEvent) => {
  console.log('clicked');
};
```

Svelte:
```svelte
<script lang="ts">
  function handleClick(e: MouseEvent) {
    console.log('clicked');
  }
</script>

<button onclick={handleClick}>Click me</button>
```

---

## Testing Strategy

1. **Unit Tests:** Use Vitest for Svelte component tests
2. **Integration Tests:** Use Testing Library for Svelte
3. **E2E Tests:** Use Playwright for full user flows
4. **Visual Regression:** Use Chromatic or Percy for visual testing
5. **Accessibility:** Use axe-core for automated a11y testing
