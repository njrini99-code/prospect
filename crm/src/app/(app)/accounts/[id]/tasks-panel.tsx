"use client";

import * as React from "react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { addTask, toggleTask } from "@/app/actions";
import { formatDate } from "@/lib/utils";
import type { Task } from "@/db/schema";

export function TasksPanel({
  companyKey,
  tasks,
}: {
  companyKey: string;
  tasks: Task[];
}) {
  const [draft, setDraft] = React.useState("");
  const [due, setDue] = React.useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    if (!draft.trim()) return;
    start(async () => {
      try {
        await addTask({
          companyKey,
          body: draft,
          dueDate: due || null,
        });
        setDraft("");
        setDue("");
        toast.success("Task added");
      } catch (e: any) {
        toast.error("Failed", { description: e?.message });
      }
    });
  };

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="New task — keep it actionable"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="w-36"
          />
          <Button onClick={submit} disabled={pending || !draft.trim()}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </Card>
      <div className="space-y-1">
        {tasks.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            No tasks.
          </div>
        )}
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const initialDone = task.status === "done";
  const [done, setDone] = React.useState(initialDone);
  return (
    <Card className="px-3 py-2">
      <div className="flex items-center gap-3">
        <Checkbox
          checked={done}
          onCheckedChange={async (v) => {
            const next = Boolean(v);
            setDone(next);
            try {
              await toggleTask(task.id, next);
            } catch {
              setDone(!next);
            }
          }}
        />
        <span
          className={
            "flex-1 text-sm " +
            (done ? "line-through text-muted-foreground" : "")
          }
        >
          {task.body}
        </span>
        {task.dueDate && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {formatDate(task.dueDate)}
          </span>
        )}
      </div>
    </Card>
  );
}
