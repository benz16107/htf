type AppHeaderProps = {
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
};

export function AppHeader({ title, subtitle, actions }: AppHeaderProps) {
  return (
    <header className="page-header animate-in">
      <div className="page-header__top">
        <h1>{title}</h1>
        {actions}
      </div>
      {subtitle && <p className="product-subtitle">{subtitle}</p>}
    </header>
  );
}
