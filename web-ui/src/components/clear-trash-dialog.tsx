import type { ReactElement } from "react";

import { useTranslation } from "@/i18n";

import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogBody,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/dialog";

export function ClearTrashDialog({
	open,
	taskCount,
	onCancel,
	onConfirm,
}: {
	open: boolean;
	taskCount: number;
	onCancel: () => void;
	onConfirm: () => void;
}): ReactElement {
	const { t } = useTranslation();

	return (
		<AlertDialog
			open={open}
			onOpenChange={(isOpen) => {
				if (!isOpen) onCancel();
			}}
		>
			<AlertDialogHeader>
				<AlertDialogTitle>{t("clearTrash.title")}</AlertDialogTitle>
			</AlertDialogHeader>
			<AlertDialogBody>
				<AlertDialogDescription>
					{t("clearTrash.description", { count: taskCount })}
				</AlertDialogDescription>
				<p className="text-text-primary">{t("clearTrash.cannotUndo")}</p>
			</AlertDialogBody>
			<AlertDialogFooter>
				<AlertDialogCancel asChild>
					<Button variant="default" onClick={onCancel}>
						{t("common.cancel")}
					</Button>
				</AlertDialogCancel>
				<AlertDialogAction asChild>
					<Button variant="danger" onClick={onConfirm}>
						{t("clearTrash.clearButton")}
					</Button>
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialog>
	);
}
