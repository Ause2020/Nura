import Link from "next/link";
import { ExportDataSection } from "@/components/settings/export-data-section";
import { SETTINGS_NAV } from "@/lib/settings/constants";

export default function ConfiguracionPage() {
  return (
    <>
      <section className="grid sm:grid-cols-2 gap-3">
        {SETTINGS_NAV.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="bg-white border border-border rounded-md p-4 hover:border-sage/40 transition-colors duration-150"
          >
            <Icon className="h-4 w-4 text-sage mb-2" />
            <p className="text-sm font-medium text-ink">{label}</p>
            <p className="text-xs text-ink-faint mt-0.5">{description}</p>
          </Link>
        ))}
      </section>

      <ExportDataSection />
    </>
  );
}
