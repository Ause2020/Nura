"use client";

import dynamic from "next/dynamic";
import { StepChunkFallback } from "@/components/haccp-plan/step-chunk-fallback";

const loading = () => <StepChunkFallback />;

export const Step2Product = dynamic(
  () => import("@/components/haccp-plan/steps/step-2-product").then((m) => m.Step2Product),
  { loading, ssr: false }
);

export const Step3Use = dynamic(
  () => import("@/components/haccp-plan/steps/step-3-use").then((m) => m.Step3Use),
  { loading, ssr: false }
);

export const Step4Flow = dynamic(
  () => import("@/components/haccp-plan/steps/step-4-flow").then((m) => m.Step4Flow),
  { loading, ssr: false }
);

export const Step5Validation = dynamic(
  () =>
    import("@/components/haccp-plan/steps/step-5-validation").then((m) => m.Step5Validation),
  { loading, ssr: false }
);

export const Step6Hazards = dynamic(
  () => import("@/components/haccp-plan/steps/step-6-hazards").then((m) => m.Step6Hazards),
  { loading, ssr: false }
);

export const Step7Ccp = dynamic(
  () => import("@/components/haccp-plan/steps/step-7-ccp").then((m) => m.Step7Ccp),
  { loading, ssr: false }
);

export const Step8Limits = dynamic(
  () => import("@/components/haccp-plan/steps/step-8-limits").then((m) => m.Step8Limits),
  { loading, ssr: false }
);

export const Step9Monitoring = dynamic(
  () =>
    import("@/components/haccp-plan/steps/step-9-monitoring").then((m) => m.Step9Monitoring),
  { loading, ssr: false }
);

export const Step10Corrective = dynamic(
  () =>
    import("@/components/haccp-plan/steps/step-10-corrective").then((m) => m.Step10Corrective),
  { loading, ssr: false }
);

export const Step11Verification = dynamic(
  () =>
    import("@/components/haccp-plan/steps/step-11-verification").then(
      (m) => m.Step11Verification
    ),
  { loading, ssr: false }
);

export const Step12Docs = dynamic(
  () => import("@/components/haccp-plan/steps/step-12-docs").then((m) => m.Step12Docs),
  { loading, ssr: false }
);

export const RiskMatrixModal = dynamic(
  () =>
    import("@/components/haccp-plan/risk-matrix-modal").then((m) => m.RiskMatrixModal),
  { loading, ssr: false }
);
