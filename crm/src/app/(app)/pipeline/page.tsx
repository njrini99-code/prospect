import { pipelineByStage } from "@/lib/queries";
import { PipelineBoard } from "./pipeline-board";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const { stages, grouped } = await pipelineByStage();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          MEDDPICC-scored deals by stage
        </p>
      </div>
      <PipelineBoard stages={stages} grouped={grouped} />
    </div>
  );
}
