import { ReactNode } from "react";
import { t } from "../i18n";

export function Btn({ children, onClick, disabled, className = "", on, danger }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; on?: boolean; danger?: boolean;
}) {
  return (
    <button className={`mc-btn ${on ? "on" : ""} ${danger ? "danger" : ""} ${className}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function Logo({ size = 72 }: { size?: number }) {
  return (
    <h1 className="logo select-none text-center leading-none" style={{ fontSize: size }}>
      Sky<span>Craft</span>
    </h1>
  );
}

export function Backdrop({ children }: { children: ReactNode }) {
  return (
    <div className="sky-bg fixed inset-0 overflow-hidden">
      <div className="absolute right-[12%] top-[10%] h-20 w-20 bg-yellow-200 shadow-[0_0_60px_20px_rgba(255,240,150,0.7)]" />
      {[8, 22, 40, 62].map((top, i) => (
        <div key={i} className="cloud" style={{ top: `${top}%`, width: 60, height: 22, animationDuration: `${50 + i * 17}s`, animationDelay: `-${i * 19}s` }} />
      ))}
      <div className="island" style={{ left: "6%", top: "58%", width: 260 }}>
        <div className="top" /><div className="body" style={{ height: 120 }} />
      </div>
      <div className="island" style={{ right: "7%", top: "50%", width: 200, animationDelay: "-2s" }}>
        <div className="top" /><div className="body" style={{ height: 90 }} />
      </div>
      <div className="island" style={{ left: "44%", top: "74%", width: 130, animationDelay: "-4s" }}>
        <div className="top" /><div className="body" style={{ height: 60 }} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center overflow-auto p-4">{children}</div>
    </div>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <label className="block text-sm font-bold text-neutral-800">
      <div className="mb-1 flex justify-between"><span>{label}</span><span>{fmt ? fmt(value) : value}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm font-bold text-neutral-800">
      <span>{label}</span>
      <button className={`mc-btn !w-20 !py-1 ${value ? "on" : ""}`} onClick={() => onChange(!value)}>{value ? t("on") : t("off")}</button>
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-2">
      {options.map(([v, l]) => (
        <button key={v} className={`mc-btn !py-1.5 !text-sm ${value === v ? "on" : ""}`} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}
