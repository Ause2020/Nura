import type { HaccpDbClient } from "@/lib/haccp-plan/db";
import { getStepData } from "@/lib/haccp-plan/step-data-service";
import type { CriticalLimit, HazardRow, MonitoringPlan } from "@/lib/haccp-plan/types";

export interface PccMonitoringForm {
  hazardId: string;
  pccNumber: number;
  processStep: string;
  hazard: string;
  parameter: string;
  criticalLimit: string;
  operationalLimit: string;
  what: string;
  how: string;
  frequency: string;
  who: string;
  records: string;
  calibration: string;
}

export async function getPccMonitoringContract(
  organizationId: string,
  client?: HaccpDbClient
): Promise<PccMonitoringForm[]> {
  const [step7, step8, step9] = await Promise.all([
    getStepData(organizationId, 7, client),
    getStepData(organizationId, 8, client),
    getStepData(organizationId, 9, client),
  ]);

  const ccps = (step7?.hazards ?? []).filter((hazard) => hazard.isCCP === true);
  const limits = new Map(
    (step8?.criticalLimits ?? []).map((item: CriticalLimit) => [item.hazardId, item])
  );
  const plans = new Map(
    (step9?.monitoringPlans ?? []).map((item: MonitoringPlan) => [item.hazardId, item])
  );

  return ccps.map((hazard: HazardRow, index) => {
    const limit = limits.get(hazard.id);
    const plan = plans.get(hazard.id);
    return {
      hazardId: hazard.id,
      pccNumber: limit?.pccNumber ?? plan?.pccNumber ?? index + 1,
      processStep: hazard.processStep,
      hazard: hazard.description,
      parameter: limit?.parameter ?? "",
      criticalLimit: limit?.criticalLimit ?? "",
      operationalLimit: limit?.operationalLimit ?? "",
      what: plan?.what ?? "",
      how: plan?.how ?? "",
      frequency: plan?.frequency ?? "",
      who: plan?.who ?? "",
      records: plan?.records ?? "",
      calibration: plan?.calibration ?? "",
    };
  });
}
