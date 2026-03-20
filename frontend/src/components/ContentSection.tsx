interface ContentSectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function ContentSection({ title, subtitle, children }: ContentSectionProps) {
  return (
    <div className="space-y-6">
      {subtitle && <span className="text-label">{subtitle}</span>}
      <h2 className="text-6xl md:text-8xl font-serif font-light tracking-tight text-foreground/90">
        {title}
      </h2>
      <div className="text-poetic text-2xl md:text-3xl space-y-4">
        {children}
      </div>
    </div>
  );
}
