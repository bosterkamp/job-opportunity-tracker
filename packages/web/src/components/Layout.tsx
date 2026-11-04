import { Link, NavLink, Outlet } from 'react-router';
import styles from './Layout.module.css';

interface NavItem {
  to: string;
  label: string;
  // A shorter label where the full one doesn't fit (the phone's bottom bar and tablets).
  short?: string;
}

const NAV_ITEMS: NavItem[] = [
  // Stryker disable next-line StringLiteral: Layout is the root route, so '' also resolves to '/'
  { to: '/', label: 'Overview' },
  { to: '/leads', label: 'Networking leads', short: 'Leads' },
  // Last, on desktop and phones (feature 011).
  { to: '/archive', label: 'Archive' },
];

export function Layout() {
  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {/* The CSS shows the full title or, where it doesn't fit, the short one; the link's
              name is always the full one. The icon is decoration (feature 008). */}
          <Link to="/" aria-label="Job Opportunity Tracker">
            <img className={styles.icon} src="/icon.svg" alt="" />
            <span className={styles.longTitle}>Job Opportunity Tracker</span>
            <span className={styles.shortTitle}>Job Tracker</span>
          </Link>
        </h1>
        <nav aria-label="Main" className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={styles.navLink}
              aria-label={item.short && item.label}
            >
              {item.short ? (
                <>
                  {/* The CSS shows one or the other; the link's name is always the full one. */}
                  <span className={styles.longLabel}>{item.label}</span>
                  <span className={styles.shortLabel}>{item.short}</span>
                </>
              ) : (
                item.label
              )}
            </NavLink>
          ))}
        </nav>
        <Link to="/opportunities/new" className={styles.addButton}>
          Add opportunity
        </Link>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </>
  );
}
