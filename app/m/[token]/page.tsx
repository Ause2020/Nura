import { FieldMonitorForm } from "@/components/production-records/field-monitor-form";
import { getFieldMonitorContext } from "@/lib/production-records/qr-context";

export default async function FieldMonitorPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const context = await getFieldMonitorContext(token);

  if (!context) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-background">
        <div className="w-full max-w-md bg-white border border-border rounded-md p-6 text-center space-y-3">
          <h1 className="font-display text-lg font-semibold text-ink">
            Enlace no disponible
          </h1>
          <p className="text-sm text-ink-faint">
            El QR expiró, fue cerrado o la plantilla ya no está activa. Pide uno
            nuevo a calidad.
          </p>
        </div>
      </div>
    );
  }

  return (
    <FieldMonitorForm
      token={token}
      template={context.template}
      sections={context.sections}
      fields={context.fields}
      organizationName={context.organizationName}
      label={context.link.label}
    />
  );
}
