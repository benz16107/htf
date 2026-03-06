type AppHeaderProps = {
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
};

export function AppHeader({ title, subtitle, actions }: AppHeaderProps) {
  return (
    <header className="page-header">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{title}</h1>
        {actions}
      </div>
      {subtitle && <p className="muted">{subtitle}</p>}
    </header>
  );
}
