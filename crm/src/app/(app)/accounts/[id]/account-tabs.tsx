"use client";

import * as React from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TouchTimeline } from "./touch-timeline";
import { MeddpiccEditor } from "./meddpicc-editor";
import { NotesPanel } from "./notes-panel";
import { TasksPanel } from "./tasks-panel";
import { BuyerCastPanel } from "./buyer-cast-panel";
import { ActivityFeed } from "./activity-feed";
import { OverviewPanel } from "./overview-panel";
import type {
  Account,
  Touch,
  OutcomeRow,
  Meddpicc,
  BuyerCast,
  Note,
  Task,
} from "@/db/schema";

export function AccountTabs({
  account,
  touches,
  outcomes,
  meddpicc,
  buyerCast,
  notes,
  tasks,
}: {
  account: Account;
  touches: Touch[];
  outcomes: OutcomeRow[];
  meddpicc: Meddpicc | null;
  buyerCast: BuyerCast | null;
  notes: Note[];
  tasks: Task[];
}) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="touches">
          Touches
          <Badge variant="secondary" className="ml-1.5 font-mono text-[9px] h-4 px-1">
            {touches.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="meddpicc">MEDDPICC</TabsTrigger>
        <TabsTrigger value="notes">
          Notes
          <Badge variant="secondary" className="ml-1.5 font-mono text-[9px] h-4 px-1">
            {notes.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="tasks">
          Tasks
          <Badge variant="secondary" className="ml-1.5 font-mono text-[9px] h-4 px-1">
            {tasks.filter((t) => t.status !== "done").length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="cast">Buyer cast</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <OverviewPanel account={account} touches={touches} />
      </TabsContent>
      <TabsContent value="touches">
        <TouchTimeline touches={touches} outcomes={outcomes} />
      </TabsContent>
      <TabsContent value="meddpicc">
        <MeddpiccEditor
          companyKey={account.companyKey ?? String(account.id ?? "")}
          meddpicc={meddpicc}
        />
      </TabsContent>
      <TabsContent value="notes">
        <NotesPanel
          companyKey={account.companyKey ?? String(account.id ?? "")}
          notes={notes}
        />
      </TabsContent>
      <TabsContent value="tasks">
        <TasksPanel
          companyKey={account.companyKey ?? String(account.id ?? "")}
          tasks={tasks}
        />
      </TabsContent>
      <TabsContent value="cast">
        <BuyerCastPanel buyerCast={buyerCast} />
      </TabsContent>
      <TabsContent value="activity">
        <ActivityFeed
          touches={touches}
          outcomes={outcomes}
          notes={notes}
        />
      </TabsContent>
    </Tabs>
  );
}
