// Settings dialog composition for Kanban.
// Generic app settings live here, while Cline-specific provider state and
// side effects should stay in use-runtime-settings-cline-controller.ts.
import * as RadixCheckbox from "@radix-ui/react-checkbox";
import * as RadixPopover from "@radix-ui/react-popover";
import * as RadixSwitch from "@radix-ui/react-switch";
import { getRuntimeAgentCatalogEntry, getRuntimeLaunchSupportedAgentCatalog } from "@runtime-agent-catalog";
import { areRuntimeProjectShortcutsEqual } from "@runtime-shortcuts";
import { Check, ChevronDown, Circle, CircleDot, ExternalLink, Plus, Settings, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClineSetupSection } from "@/components/shared/cline-setup-section";
import {
	getRuntimeShortcutIconComponent,
	getRuntimeShortcutPickerOption,
	RUNTIME_SHORTCUT_ICON_OPTIONS,
	type RuntimeShortcutIconOption,
	type RuntimeShortcutPickerIconId,
} from "@/components/shared/runtime-shortcut-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { TASK_GIT_BASE_REF_PROMPT_VARIABLE, type TaskGitAction } from "@/git-actions/build-task-git-action-prompt";
import { useRuntimeSettingsClineController } from "@/hooks/use-runtime-settings-cline-controller";
import { useRuntimeSettingsClineMcpController } from "@/hooks/use-runtime-settings-cline-mcp-controller";
import { openFileOnHost } from "@/runtime/runtime-config-query";
import type {
	RuntimeAgentId,
	RuntimeClineMcpServerAuthStatus,
	RuntimeConfigResponse,
	RuntimeProjectShortcut,
} from "@/runtime/types";
import { useRuntimeConfig } from "@/runtime/use-runtime-config";
import {
	type BrowserNotificationPermission,
	getBrowserNotificationPermission,
	requestBrowserNotificationPermission,
} from "@/utils/notification-permission";
import { formatPathForDisplay } from "@/utils/path-display";
import { useUnmount, useWindowEvent } from "@/utils/react-use";

import type { TFunction } from "i18next";

import i18next, { useTranslation } from "@/i18n";

interface RuntimeSettingsAgentRowModel {
	id: RuntimeAgentId;
	label: string;
	binary: string;
	command: string;
	installed: boolean | null;
}

function quoteCommandPartForDisplay(part: string): string {
	if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(part)) {
		return part;
	}
	return JSON.stringify(part);
}

function buildDisplayedAgentCommand(agentId: RuntimeAgentId, binary: string, autonomousModeEnabled: boolean): string {
	if (agentId === "cline") {
		return "";
	}
	const args = autonomousModeEnabled ? (getRuntimeAgentCatalogEntry(agentId)?.autonomousArgs ?? []) : [];
	return [binary, ...args.map(quoteCommandPartForDisplay)].join(" ");
}

function normalizeTemplateForComparison(value: string): string {
	return value.replaceAll("\r\n", "\n").trim();
}

const GIT_PROMPT_VARIANT_OPTION_VALUES: readonly TaskGitAction[] = ["commit", "pr"];

export type RuntimeSettingsSection = "shortcuts";

const SETTINGS_AGENT_ORDER: readonly RuntimeAgentId[] = ["cline", "claude", "codex"];

function getShortcutIconOption(icon: string | undefined): RuntimeShortcutIconOption {
	return getRuntimeShortcutPickerOption(icon);
}

function ShortcutIconComponent({ icon, size = 14 }: { icon: string | undefined; size?: number }): React.ReactElement {
	const Component = getRuntimeShortcutIconComponent(icon);
	return <Component size={size} />;
}

function formatNotificationPermissionStatus(permission: BrowserNotificationPermission, t: TFunction): string {
	if (permission === "default") {
		return t("settings.notRequestedYet");
	}
	return permission;
}

function getNextShortcutLabel(shortcuts: RuntimeProjectShortcut[], baseLabel: string): string {
	const normalizedTakenLabels = new Set(
		shortcuts.map((shortcut) => shortcut.label.trim().toLowerCase()).filter((label) => label.length > 0),
	);
	const normalizedBaseLabel = baseLabel.trim().toLowerCase();
	if (!normalizedTakenLabels.has(normalizedBaseLabel)) {
		return baseLabel;
	}

	let suffix = 2;
	while (normalizedTakenLabels.has(`${normalizedBaseLabel} ${suffix}`)) {
		suffix += 1;
	}
	return `${baseLabel} ${suffix}`;
}

function AgentRow({
	agent,
	isSelected,
	onSelect,
	disabled,
}: {
	agent: RuntimeSettingsAgentRowModel;
	isSelected: boolean;
	onSelect: () => void;
	disabled: boolean;
}): React.ReactElement {
	const { t } = useTranslation();
	const installUrl = getRuntimeAgentCatalogEntry(agent.id)?.installUrl;
	const isNativeCline = agent.id === "cline";
	const isInstalled = agent.installed === true;
	const isInstallStatusPending = !isNativeCline && agent.installed === null;

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => {
				if (isInstalled && !disabled) {
					onSelect();
				}
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter" && isInstalled && !disabled) {
					onSelect();
				}
			}}
			className="flex items-center justify-between gap-3 py-1.5"
			style={{ cursor: isInstalled ? "pointer" : "default" }}
		>
			<div className="flex items-start gap-2 min-w-0">
				{isSelected ? (
					<CircleDot size={16} className="text-accent mt-0.5 shrink-0" />
				) : (
					<Circle
						size={16}
						className={cn("mt-0.5 shrink-0", !isInstalled ? "text-text-tertiary" : "text-text-secondary")}
					/>
				)}
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<span className="text-[13px] text-text-primary">{agent.label}</span>
						{!isNativeCline && isInstalled ? (
							<span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-status-green/10 text-status-green">
								Installed
							</span>
						) : isInstallStatusPending ? (
							<span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-surface-3 text-text-secondary">
								Checking...
							</span>
						) : null}
					</div>
					{agent.command ? (
						<p className="text-text-secondary font-mono text-xs mt-0.5 m-0">{agent.command}</p>
					) : null}
				</div>
			</div>
			{!isNativeCline && agent.installed === false && installUrl ? (
				<a
					href={installUrl}
					target="_blank"
					rel="noreferrer"
					onClick={(event: React.MouseEvent) => event.stopPropagation()}
					className="inline-flex items-center justify-center rounded-md font-medium duration-150 cursor-default select-none h-7 px-2 text-xs bg-surface-2 border border-border text-text-primary hover:bg-surface-3 hover:border-border-bright"
				>
					Install
				</a>
			) : !isNativeCline && agent.installed === false ? (
				<Button size="sm" disabled>
					Install
				</Button>
			) : null}
		</div>
	);
}

function InlineUtilityButton({
	text,
	onClick,
	disabled,
	monospace,
	widthCh,
}: {
	text: string;
	onClick: () => void;
	disabled?: boolean;
	monospace?: boolean;
	widthCh?: number;
}): React.ReactElement {
	return (
		<Button
			size="sm"
			disabled={disabled}
			onClick={onClick}
			className={cn(monospace && "font-mono")}
			style={{
				fontSize: 10,
				verticalAlign: "middle",
				...(typeof widthCh === "number"
					? {
							width: `${widthCh}ch`,
							justifyContent: "center",
						}
					: {}),
			}}
		>
			{text}
		</Button>
	);
}

function ShortcutIconPicker({
	value,
	onSelect,
}: {
	value: string | undefined;
	onSelect: (icon: RuntimeShortcutPickerIconId) => void;
}): React.ReactElement {
	const [open, setOpen] = useState(false);
	const selectedOption = getShortcutIconOption(value);

	return (
		<RadixPopover.Root open={open} onOpenChange={setOpen}>
			<RadixPopover.Trigger asChild>
				<button
					type="button"
					aria-label={`Shortcut icon: ${selectedOption.label}`}
					className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md border border-border bg-surface-2 text-text-primary hover:bg-surface-3"
				>
					<ShortcutIconComponent icon={value} size={14} />
					<ChevronDown size={12} />
				</button>
			</RadixPopover.Trigger>
			<RadixPopover.Portal>
				<RadixPopover.Content
					side="bottom"
					align="start"
					sideOffset={4}
					className="z-50 rounded-md border border-border bg-surface-2 p-1 shadow-lg"
					style={{ animation: "kb-tooltip-show 100ms ease" }}
				>
					<div className="flex gap-0.5">
						{RUNTIME_SHORTCUT_ICON_OPTIONS.map((option) => {
							const IconComponent = getRuntimeShortcutIconComponent(option.value);
							return (
								<button
									key={option.value}
									type="button"
									aria-label={option.label}
									className={cn(
										"p-1.5 rounded hover:bg-surface-3",
										selectedOption.value === option.value && "bg-surface-3",
									)}
									onClick={() => {
										onSelect(option.value);
										setOpen(false);
									}}
								>
									<IconComponent size={14} />
								</button>
							);
						})}
					</div>
				</RadixPopover.Content>
			</RadixPopover.Portal>
		</RadixPopover.Root>
	);
}

export function RuntimeSettingsDialog({
	open,
	workspaceId,
	initialConfig = null,
	liveMcpAuthStatuses = null,
	onOpenChange,
	onSaved,
	initialSection,
}: {
	open: boolean;
	workspaceId: string | null;
	initialConfig?: RuntimeConfigResponse | null;
	liveMcpAuthStatuses?: RuntimeClineMcpServerAuthStatus[] | null;
	onOpenChange: (open: boolean) => void;
	onSaved?: () => void;
	initialSection?: RuntimeSettingsSection | null;
}): React.ReactElement {
	const { t } = useTranslation();
	const gitPromptVariantOptions = [
		{ value: "commit" as TaskGitAction, label: t("settings.gitPromptOptions.commit") },
		{ value: "pr" as TaskGitAction, label: t("settings.gitPromptOptions.makePr") },
	];
	const { config, isLoading, isSaving, save } = useRuntimeConfig(open, workspaceId, initialConfig);
	const [selectedAgentId, setSelectedAgentId] = useState<RuntimeAgentId>("claude");
	const [agentAutonomousModeEnabled, setAgentAutonomousModeEnabled] = useState(true);
	const [readyForReviewNotificationsEnabled, setReadyForReviewNotificationsEnabled] = useState(true);
	const [notificationPermission, setNotificationPermission] = useState<BrowserNotificationPermission>("unsupported");
	const [shortcuts, setShortcuts] = useState<RuntimeProjectShortcut[]>([]);
	const [commitPromptTemplate, setCommitPromptTemplate] = useState("");
	const [openPrPromptTemplate, setOpenPrPromptTemplate] = useState("");
	const [selectedPromptVariant, setSelectedPromptVariant] = useState<TaskGitAction>("commit");
	const [copiedVariableToken, setCopiedVariableToken] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [pendingShortcutScrollIndex, setPendingShortcutScrollIndex] = useState<number | null>(null);
	const copiedVariableResetTimerRef = useRef<number | null>(null);
	const shortcutsSectionRef = useRef<HTMLHeadingElement | null>(null);
	const shortcutRowRefs = useRef<Array<HTMLDivElement | null>>([]);
	const controlsDisabled = isLoading || isSaving || config === null;
	const commitPromptTemplateDefault = config?.commitPromptTemplateDefault ?? "";
	const openPrPromptTemplateDefault = config?.openPrPromptTemplateDefault ?? "";
	const isCommitPromptAtDefault =
		normalizeTemplateForComparison(commitPromptTemplate) ===
		normalizeTemplateForComparison(commitPromptTemplateDefault);
	const isOpenPrPromptAtDefault =
		normalizeTemplateForComparison(openPrPromptTemplate) ===
		normalizeTemplateForComparison(openPrPromptTemplateDefault);
	const selectedPromptValue = selectedPromptVariant === "commit" ? commitPromptTemplate : openPrPromptTemplate;
	const selectedPromptDefaultValue =
		selectedPromptVariant === "commit" ? commitPromptTemplateDefault : openPrPromptTemplateDefault;
	const isSelectedPromptAtDefault =
		selectedPromptVariant === "commit" ? isCommitPromptAtDefault : isOpenPrPromptAtDefault;
	const selectedPromptPlaceholder =
		selectedPromptVariant === "commit" ? t("settings.commitPromptPlaceholder") : t("settings.prPromptPlaceholder");
	const bypassPermissionsCheckboxId = "runtime-settings-bypass-permissions";
	const refreshNotificationPermission = useCallback(() => {
		setNotificationPermission(getBrowserNotificationPermission());
	}, []);

	const supportedAgents = useMemo<RuntimeSettingsAgentRowModel[]>(() => {
		const agents =
			config?.agents.map((agent) => ({
				id: agent.id,
				label: agent.label,
				binary: agent.binary,
				installed: agent.id === "cline" ? true : agent.installed,
			})) ??
			getRuntimeLaunchSupportedAgentCatalog().map((agent) => ({
				id: agent.id,
				label: agent.label,
				binary: agent.binary,
				installed: agent.id === "cline" ? true : null,
			}));
		const orderIndexByAgentId = new Map(SETTINGS_AGENT_ORDER.map((agentId, index) => [agentId, index] as const));
		const orderedAgents = [...agents].sort((left, right) => {
			const leftOrderIndex = orderIndexByAgentId.get(left.id) ?? Number.MAX_SAFE_INTEGER;
			const rightOrderIndex = orderIndexByAgentId.get(right.id) ?? Number.MAX_SAFE_INTEGER;
			return leftOrderIndex - rightOrderIndex;
		});
		return orderedAgents.map((agent) => ({
			...agent,
			command: buildDisplayedAgentCommand(agent.id, agent.binary, agentAutonomousModeEnabled),
		}));
	}, [agentAutonomousModeEnabled, config?.agents]);
	const displayedAgents = useMemo(() => supportedAgents, [supportedAgents]);
	const configuredAgentId = config?.selectedAgentId ?? null;
	const firstInstalledAgentId = displayedAgents.find((agent) => agent.installed)?.id;
	const fallbackAgentId = firstInstalledAgentId ?? displayedAgents[0]?.id ?? "claude";
	const initialSelectedAgentId = configuredAgentId ?? fallbackAgentId;
	const initialAgentAutonomousModeEnabled = config?.agentAutonomousModeEnabled ?? true;
	const initialReadyForReviewNotificationsEnabled = config?.readyForReviewNotificationsEnabled ?? true;
	const initialShortcuts = config?.shortcuts ?? [];
	const initialCommitPromptTemplate = config?.commitPromptTemplate ?? "";
	const initialOpenPrPromptTemplate = config?.openPrPromptTemplate ?? "";
	const clineSettings = useRuntimeSettingsClineController({
		open,
		workspaceId,
		selectedAgentId,
		config,
	});
	const clineMcpSettings = useRuntimeSettingsClineMcpController({
		open,
		workspaceId,
		selectedAgentId,
		liveAuthStatuses: liveMcpAuthStatuses,
	});
	const hasUnsavedChanges = useMemo(() => {
		if (!config) {
			return false;
		}
		if (selectedAgentId !== initialSelectedAgentId) {
			return true;
		}
		if (agentAutonomousModeEnabled !== initialAgentAutonomousModeEnabled) {
			return true;
		}
		if (readyForReviewNotificationsEnabled !== initialReadyForReviewNotificationsEnabled) {
			return true;
		}
		if (clineSettings.hasUnsavedChanges) {
			return true;
		}
		if (clineMcpSettings.hasUnsavedChanges) {
			return true;
		}
		if (!areRuntimeProjectShortcutsEqual(shortcuts, initialShortcuts)) {
			return true;
		}
		if (
			normalizeTemplateForComparison(commitPromptTemplate) !==
			normalizeTemplateForComparison(initialCommitPromptTemplate)
		) {
			return true;
		}
		return (
			normalizeTemplateForComparison(openPrPromptTemplate) !==
			normalizeTemplateForComparison(initialOpenPrPromptTemplate)
		);
	}, [
		agentAutonomousModeEnabled,
		clineMcpSettings.hasUnsavedChanges,
		clineSettings.hasUnsavedChanges,
		commitPromptTemplate,
		config,
		initialAgentAutonomousModeEnabled,
		initialCommitPromptTemplate,
		initialOpenPrPromptTemplate,
		initialReadyForReviewNotificationsEnabled,
		initialSelectedAgentId,
		initialShortcuts,
		openPrPromptTemplate,
		readyForReviewNotificationsEnabled,
		selectedAgentId,
		shortcuts,
	]);

	useEffect(() => {
		if (!open) {
			return;
		}
		setSelectedAgentId(configuredAgentId ?? fallbackAgentId);
		setAgentAutonomousModeEnabled(config?.agentAutonomousModeEnabled ?? true);
		setReadyForReviewNotificationsEnabled(config?.readyForReviewNotificationsEnabled ?? true);
		setShortcuts(config?.shortcuts ?? []);
		setCommitPromptTemplate(config?.commitPromptTemplate ?? "");
		setOpenPrPromptTemplate(config?.openPrPromptTemplate ?? "");
		setSaveError(null);
	}, [
		config?.agentAutonomousModeEnabled,
		config?.commitPromptTemplate,
		config?.openPrPromptTemplate,
		config?.readyForReviewNotificationsEnabled,
		config?.selectedAgentId,
		config?.shortcuts,
		fallbackAgentId,
		open,
	]);

	useEffect(() => {
		if (!open) {
			return;
		}
		refreshNotificationPermission();
	}, [open, refreshNotificationPermission]);
	useWindowEvent("focus", open ? refreshNotificationPermission : null);

	useEffect(() => {
		if (!open || initialSection !== "shortcuts") {
			return;
		}
		const timeout = window.setTimeout(() => {
			shortcutsSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
		}, 500);
		return () => {
			window.clearTimeout(timeout);
		};
	}, [initialSection, open]);

	useEffect(() => {
		if (pendingShortcutScrollIndex === null) {
			return;
		}
		const frame = window.requestAnimationFrame(() => {
			const target = shortcutRowRefs.current[pendingShortcutScrollIndex] ?? null;
			if (target) {
				target.scrollIntoView({ block: "nearest", behavior: "smooth" });
				const firstInput = target.querySelector("input");
				firstInput?.focus();
				setPendingShortcutScrollIndex(null);
			}
		});
		return () => {
			window.cancelAnimationFrame(frame);
		};
	}, [pendingShortcutScrollIndex, shortcuts]);

	useUnmount(() => {
		if (copiedVariableResetTimerRef.current !== null) {
			window.clearTimeout(copiedVariableResetTimerRef.current);
			copiedVariableResetTimerRef.current = null;
		}
	});

	const handleCopyVariableToken = (token: string) => {
		void (async () => {
			try {
				await navigator.clipboard.writeText(token);
				setCopiedVariableToken(token);
				if (copiedVariableResetTimerRef.current !== null) {
					window.clearTimeout(copiedVariableResetTimerRef.current);
				}
				copiedVariableResetTimerRef.current = window.setTimeout(() => {
					setCopiedVariableToken((current) => (current === token ? null : current));
					copiedVariableResetTimerRef.current = null;
				}, 2000);
			} catch {
				// Ignore clipboard failures.
			}
		})();
	};

	const handleSelectedPromptChange = (value: string) => {
		if (selectedPromptVariant === "commit") {
			setCommitPromptTemplate(value);
			return;
		}
		setOpenPrPromptTemplate(value);
	};

	const handleResetSelectedPrompt = () => {
		handleSelectedPromptChange(selectedPromptDefaultValue);
	};

	const handleSave = async () => {
		setSaveError(null);
		if (!config) {
			setSaveError(t("settings.saveErrors.stillLoading"));
			return;
		}
		const selectedAgent = displayedAgents.find((agent) => agent.id === selectedAgentId);
		if (!selectedAgent || selectedAgent.installed !== true) {
			setSaveError(t("settings.saveErrors.agentNotInstalled"));
			return;
		}
		const shouldRequestNotificationPermission =
			!initialReadyForReviewNotificationsEnabled &&
			readyForReviewNotificationsEnabled &&
			notificationPermission === "default";
		if (shouldRequestNotificationPermission) {
			const nextPermission = await requestBrowserNotificationPermission();
			setNotificationPermission(nextPermission);
		}
		if (selectedAgentId === "cline" && clineSettings.providerId.trim().length === 0) {
			setSaveError(t("settings.saveErrors.chooseProvider"));
			return;
		}
		if (selectedAgentId === "cline") {
			const clineProviderSaveResult = await clineSettings.saveProviderSettings();
			if (!clineProviderSaveResult.ok) {
				setSaveError(clineProviderSaveResult.message ?? t("settings.saveErrors.couldNotSaveProvider"));
				return;
			}
			const clineMcpSaveResult = await clineMcpSettings.saveMcpSettings();
			if (!clineMcpSaveResult.ok) {
				setSaveError(clineMcpSaveResult.message ?? t("settings.saveErrors.couldNotSaveMcp"));
				return;
			}
		}
		const saved = await save({
			selectedAgentId,
			agentAutonomousModeEnabled,
			readyForReviewNotificationsEnabled,
			shortcuts,
			commitPromptTemplate,
			openPrPromptTemplate,
		});
		if (!saved) {
			setSaveError(t("settings.saveErrors.couldNotSave"));
			return;
		}
		onSaved?.();
		onOpenChange(false);
	};

	const handleRequestPermission = () => {
		void (async () => {
			const nextPermission = await requestBrowserNotificationPermission();
			setNotificationPermission(nextPermission);
		})();
	};

	const handleOpenFilePath = useCallback(
		(filePath: string) => {
			setSaveError(null);
			void openFileOnHost(workspaceId, filePath).catch((error) => {
				const message = error instanceof Error ? error.message : String(error);
				setSaveError(t("settings.saveErrors.couldNotOpenFile", { message }));
			});
		},
		[workspaceId],
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogHeader title={t("settings.title")} icon={<Settings size={16} />} />
			<DialogBody>
				<h5 className="font-semibold text-text-primary m-0">{t("settings.global")}</h5>
				<p
					className="text-text-secondary font-mono text-xs m-0 break-all"
					style={{ cursor: config?.globalConfigPath ? "pointer" : undefined }}
					onClick={() => {
						if (config?.globalConfigPath) {
							handleOpenFilePath(config.globalConfigPath);
						}
					}}
				>
					{config?.globalConfigPath
						? formatPathForDisplay(config.globalConfigPath)
						: "~/.cline/kanban/config.json"}
					{config?.globalConfigPath ? <ExternalLink size={12} className="inline ml-1.5 align-middle" /> : null}
				</p>

				<h6 className="font-semibold text-text-primary mt-3 mb-0">{t("settings.agentRuntime")}</h6>
				{displayedAgents.map((agent) => (
					<AgentRow
						key={agent.id}
						agent={agent}
						isSelected={agent.id === selectedAgentId}
						onSelect={() => setSelectedAgentId(agent.id)}
						disabled={controlsDisabled}
					/>
				))}
				{config === null ? (
					<p className="text-text-secondary py-2">{t("settings.checkingInstalledAgents")}</p>
				) : null}
				<label
					htmlFor={bypassPermissionsCheckboxId}
					className="flex items-center gap-2 text-[13px] text-text-primary mt-2 cursor-pointer"
				>
					<RadixCheckbox.Root
						id={bypassPermissionsCheckboxId}
						aria-label="Enable bypass permissions flag"
						checked={agentAutonomousModeEnabled}
						disabled={controlsDisabled}
						onCheckedChange={(checked) => setAgentAutonomousModeEnabled(checked === true)}
						className="flex h-4 w-4 cursor-pointer items-center justify-center rounded border border-border bg-surface-2 data-[state=checked]:bg-accent data-[state=checked]:border-accent disabled:cursor-default disabled:opacity-40"
					>
						<RadixCheckbox.Indicator>
							<Check size={12} className="text-white" />
						</RadixCheckbox.Indicator>
					</RadixCheckbox.Root>
					<span>Enable bypass permissions flag</span>
				</label>
				<p className="text-text-secondary text-[13px] ml-6 mt-0 mb-0">
					{t("settings.bypassPermissionsHint")}
				</p>

				{selectedAgentId === "cline" ? (
					<ClineSetupSection
						controller={clineSettings}
						mcpController={clineMcpSettings}
						controlsDisabled={controlsDisabled}
						workspaceId={workspaceId}
						onError={setSaveError}
					/>
				) : null}

				<div className="flex items-center justify-between mt-4 mb-1">
					<h6 className="font-semibold text-text-primary m-0">{t("settings.gitButtonPrompts")}</h6>
				</div>
				<p className="text-text-secondary text-[13px] mt-0 mb-2">
					{t("settings.gitButtonPromptsHint")}
				</p>
				<div className="flex items-center justify-between gap-2 mb-2">
					<select
						value={selectedPromptVariant}
						onChange={(event) => setSelectedPromptVariant(event.target.value as TaskGitAction)}
						disabled={controlsDisabled}
						className="h-8 rounded-md border border-border bg-surface-2 px-2 text-[13px] text-text-primary focus:border-border-focus focus:outline-none"
						style={{ minWidth: 220 }}
					>
						{gitPromptVariantOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
					<Button
						variant="ghost"
						size="sm"
						onClick={handleResetSelectedPrompt}
						disabled={controlsDisabled || isSelectedPromptAtDefault}
					>
						{t("common.reset")}
					</Button>
				</div>
				<textarea
					rows={5}
					value={selectedPromptValue}
					onChange={(event) => handleSelectedPromptChange(event.target.value)}
					placeholder={selectedPromptPlaceholder}
					disabled={controlsDisabled}
					className="w-full rounded-md border border-border bg-surface-2 p-3 text-[13px] text-text-primary font-mono placeholder:text-text-tertiary focus:border-border-focus focus:outline-none resize-none disabled:opacity-40"
				/>
				<p className="text-text-secondary text-[13px] mt-2 mb-2.5">
					<InlineUtilityButton
						text={
							copiedVariableToken === TASK_GIT_BASE_REF_PROMPT_VARIABLE.token
								? t("settings.copied")
								: TASK_GIT_BASE_REF_PROMPT_VARIABLE.token
						}
						monospace
						widthCh={Math.max(TASK_GIT_BASE_REF_PROMPT_VARIABLE.token.length, t("settings.copied").length) + 2}
						onClick={() => {
							handleCopyVariableToken(TASK_GIT_BASE_REF_PROMPT_VARIABLE.token);
						}}
						disabled={controlsDisabled}
					/>{" "}
					{t("settings.gitPromptVariableHint", { description: TASK_GIT_BASE_REF_PROMPT_VARIABLE.description })}
				</p>
				<h6 className="font-semibold text-text-primary mt-4 mb-2">{t("settings.notifications")}</h6>
				<div className="flex items-center gap-2">
					<RadixSwitch.Root
						checked={readyForReviewNotificationsEnabled}
						disabled={controlsDisabled}
						onCheckedChange={setReadyForReviewNotificationsEnabled}
						className="relative h-5 w-9 rounded-full bg-surface-4 data-[state=checked]:bg-accent cursor-pointer disabled:opacity-40"
					>
						<RadixSwitch.Thumb className="block h-4 w-4 rounded-full bg-white shadow-sm transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
					</RadixSwitch.Root>
					<span className="text-[13px] text-text-primary">{t("settings.notifyWhenReadyForReview")}</span>
				</div>
				<div className="flex items-center gap-2 mt-2 mb-2">
					<p className="text-text-secondary text-[13px] m-0">
						{t("settings.browserPermission", { status: formatNotificationPermissionStatus(notificationPermission, t) })}
					</p>
					{notificationPermission !== "granted" && notificationPermission !== "unsupported" ? (
						<InlineUtilityButton
							text={t("settings.requestPermission")}
							onClick={handleRequestPermission}
							disabled={controlsDisabled}
						/>
					) : null}
				</div>

				<h5 className="font-semibold text-text-primary mt-4 mb-0">{t("settings.project")}</h5>
				<p
					className="text-text-secondary font-mono text-xs m-0 break-all"
					style={{ cursor: config?.projectConfigPath ? "pointer" : undefined }}
					onClick={() => {
						if (config?.projectConfigPath) {
							handleOpenFilePath(config.projectConfigPath);
						}
					}}
				>
					{config?.projectConfigPath
						? formatPathForDisplay(config.projectConfigPath)
						: "<project>/.cline/kanban/config.json"}
					{config?.projectConfigPath ? <ExternalLink size={12} className="inline ml-1.5 align-middle" /> : null}
				</p>

				<div className="flex items-center justify-between mt-3 mb-2">
					<h6 ref={shortcutsSectionRef} className="font-semibold text-text-primary m-0">
						Script shortcuts
					</h6>
					<Button
						variant="ghost"
						size="sm"
						icon={<Plus size={14} />}
						onClick={() => {
							setShortcuts((current) => {
								const nextLabel = getNextShortcutLabel(current, "Run");
								setPendingShortcutScrollIndex(current.length);
								return [
									...current,
									{
										label: nextLabel,
										command: "",
										icon: "play",
									},
								];
							});
						}}
						disabled={controlsDisabled}
					>
						Add
					</Button>
				</div>

				{shortcuts.map((shortcut, shortcutIndex) => (
					<div
						key={shortcutIndex}
						ref={(node) => {
							shortcutRowRefs.current[shortcutIndex] = node;
						}}
						className="grid gap-2 mb-1"
						style={{ gridTemplateColumns: "max-content 1fr 2fr auto" }}
					>
						<ShortcutIconPicker
							value={shortcut.icon}
							onSelect={(icon) =>
								setShortcuts((current) =>
									current.map((item, itemIndex) => (itemIndex === shortcutIndex ? { ...item, icon } : item)),
								)
							}
						/>
						<input
							value={shortcut.label}
							onChange={(event) =>
								setShortcuts((current) =>
									current.map((item, itemIndex) =>
										itemIndex === shortcutIndex ? { ...item, label: event.target.value } : item,
									),
								)
							}
							placeholder="Label"
							className="h-7 w-full rounded-md border border-border bg-surface-2 px-2 text-xs text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none"
						/>
						<input
							value={shortcut.command}
							onChange={(event) =>
								setShortcuts((current) =>
									current.map((item, itemIndex) =>
										itemIndex === shortcutIndex ? { ...item, command: event.target.value } : item,
									),
								)
							}
							placeholder="Command"
							className="h-7 w-full rounded-md border border-border bg-surface-2 px-2 text-xs text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none"
						/>
						<Button
							variant="ghost"
							size="sm"
							icon={<X size={14} />}
							aria-label={t("settings.removeShortcutAriaLabel", { label: shortcut.label })}
							onClick={() =>
								setShortcuts((current) => current.filter((_, itemIndex) => itemIndex !== shortcutIndex))
							}
						/>
					</div>
				))}
				{shortcuts.length === 0 ? (
					<p className="text-text-secondary text-[13px]">{t("settings.noShortcutsConfigured")}</p>
				) : null}

				{saveError ? (
					<div className="flex gap-2 rounded-md border border-status-red/30 bg-status-red/5 p-3 text-[13px] mt-3">
						<span className="text-text-primary">{saveError}</span>
					</div>
				) : null}
				<h6 className="font-semibold text-text-primary mt-4 mb-2">{t("settings.language")}</h6>
				<select
					value={i18next.language}
					onChange={(e) => void i18next.changeLanguage(e.target.value)}
					className="h-8 rounded-md border border-border bg-surface-2 px-2 text-[13px] text-text-primary focus:border-border-focus focus:outline-none"
				>
					<option value="en">{t("settings.languageOptions.en")}</option>
					<option value="ja">{t("settings.languageOptions.ja")}</option>
				</select>
			</DialogBody>
			<DialogFooter>
				<Button onClick={() => onOpenChange(false)} disabled={controlsDisabled}>
					{t("common.cancel")}
				</Button>
				<Button
					variant="primary"
					onClick={() => void handleSave()}
					disabled={controlsDisabled || !hasUnsavedChanges}
				>
					{t("common.save")}
				</Button>
			</DialogFooter>
		</Dialog>
	);
}
