"use client";

import * as React from "react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addNote } from "@/app/actions";
import { timeAgo } from "@/lib/utils";
import type { Note } from "@/db/schema";

export function NotesPanel({
  companyKey,
  notes,
}: {
  companyKey: string;
  notes: Note[];
}) {
  const [draft, setDraft] = React.useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    if (!draft.trim()) return;
    start(async () => {
      try {
        await addNote({ companyKey, body: draft });
        toast.success("Note added");
        setDraft("");
      } catch (e: any) {
        toast.error("Failed to save note", { description: e?.message });
      }
    });
  };

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Quick note — what did you learn? Markdown supported."
          rows={3}
          className="text-sm border-0 focus-visible:ring-0 px-0 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground">
            ⌘+Enter to save
          </span>
          <Button size="sm" onClick={submit} disabled={pending || !draft.trim()}>
            <Plus className="h-3.5 w-3.5" />
            Add note
          </Button>
        </div>
      </Card>
      <div className="space-y-2">
        {notes.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            No notes yet.
          </div>
        )}
        {notes.map((n) => (
          <Card key={n.id} className="p-3">
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {n.body}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1.5 font-mono">
              {timeAgo(n.createdAt)}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
