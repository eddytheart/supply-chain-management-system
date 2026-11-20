import { useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { ROLES, useAuth } from './auth';
import { Loading, Notice } from './ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Requisitions from './pages/Requisitions';
import RequisitionNew from './pages/RequisitionNew';
import RequisitionDetail from './pages/RequisitionDetail';
import Suppliers from './pages/Suppliers';
import SupplierDetail from './pages/SupplierDetail';
import PurchaseOrders from './pages/PurchaseOrders';
import PurchaseOrderDetail from './pages/PurchaseOrderDetail';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';
import Users from './pages/Users';
import AuditLog from './pages/AuditLog';

// What each role sees in the menu.
const NAV = {
  [ROLES.REQUESTER]: [['/', 'Home'], ['/requisitions', 'My requisitions'], ['/requisitions/new', 'New requisition']],
  [ROLES.STORE]: [['/', 'Home'], ['/requisitions', 'Requisitions'], ['/purchase-orders', 'Purchase orders'], ['/inventory', 'Inventory'], ['/suppliers', 'Suppliers'], ['/reports', 'Reports']],
  [ROLES.PROCUREMENT]: [['/', 'Home'], ['/requisitions', 'Requisitions'], ['/purchase-orders', 'Purchase orders'], ['/suppliers', 'Suppliers'], ['/inventory', 'Inventory'], ['/reports', 'Reports']],
  [ROLES.ADMIN]: [['/', 'Home'], ['/users', 'Users'], ['/audit-log', 'Audit log'], ['/requisitions', 'Requisitions'], ['/purchase-orders', 'Purchase orders'], ['/suppliers', 'Suppliers'], ['/inventory', 'Inventory'], ['/reports', 'Reports']],
};

function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const signOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand">
          <div>
            <strong>Central Stores and Procurement</strong>
            <span>University of Ibadan</span>
          </div>
          <button type="button" className="btn btn-quiet btn-sm menu-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
            Menu
          </button>
        </div>
        <nav className="nav" aria-label="Main" onClick={() => setOpen(false)}>
          {(NAV[user.role] || []).map(([to, label]) => (
            <NavLink key={to} to={to} end>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="me">
          <strong>{user.fullName}</strong>
          <span>{user.role}</span>
          <button type="button" className="btn btn-quiet btn-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

// Lets a page through only if the signed-in user has one of the allowed roles.
function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="main"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Notice kind="warn">You do not have access to this page. Use the menu to go to a page for your role.</Notice>;
  }
  return children;
}

const STAFF = [ROLES.STORE, ROLES.PROCUREMENT, ROLES.ADMIN];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="requisitions" element={<Requisitions />} />
        <Route path="requisitions/new" element={<Protected roles={[ROLES.REQUESTER]}><RequisitionNew /></Protected>} />
        <Route path="requisitions/:id" element={<RequisitionDetail />} />
        <Route path="suppliers" element={<Protected roles={STAFF}><Suppliers /></Protected>} />
        <Route path="suppliers/:id" element={<Protected roles={STAFF}><SupplierDetail /></Protected>} />
        <Route path="purchase-orders" element={<Protected roles={STAFF}><PurchaseOrders /></Protected>} />
        <Route path="purchase-orders/:id" element={<Protected roles={STAFF}><PurchaseOrderDetail /></Protected>} />
        <Route path="inventory" element={<Protected roles={STAFF}><Inventory /></Protected>} />
        <Route path="reports" element={<Protected roles={STAFF}><Reports /></Protected>} />
        <Route path="users" element={<Protected roles={[ROLES.ADMIN]}><Users /></Protected>} />
        <Route path="audit-log" element={<Protected roles={[ROLES.ADMIN]}><AuditLog /></Protected>} />
        <Route path="*" element={<Notice kind="warn">That page does not exist.</Notice>} />
      </Route>
    </Routes>
  );
}
