// Drives the real screens against a running backend: one requisition from request to closed,
// plus the "issued straight from stock" path and the access rules.
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';

configure({ asyncUtilTimeout: 8000 });
const API = import.meta.env.VITE_API_URL;
const PASSWORDS = { requester: 'Request@12345', procurement: 'Procure@12345', store: 'Store@12345', admin: 'Admin@12345' };

afterEach(() => cleanup());

// Signs in through the API (the login screen has its own test) and renders the app on a page.
async function renderAs(username, path = '/') {
  localStorage.clear();
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORDS[username] }),
  });
  localStorage.setItem('scm_token', (await res.json()).token);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider><App /></AuthProvider>
    </MemoryRouter>
  );
}

async function createRequisition(user, itemLabel, quantity, reason) {
  await renderAs('requester', '/requisitions/new');
  await screen.findByRole('heading', { name: 'New requisition' });
  await screen.findByRole('option', { name: itemLabel });
  await user.selectOptions(screen.getByLabelText('Item 1'), itemLabel);
  await user.type(screen.getByLabelText('Quantity 1'), String(quantity));
  await user.type(screen.getByLabelText('Reason'), reason);
  await user.click(screen.getByRole('button', { name: 'Submit requisition' }));
  const heading = await screen.findByRole('heading', { name: /Requisition #\d+/ });
  const id = Number(/#(\d+)/.exec(heading.textContent)[1]);
  cleanup();
  return id;
}

const stepClass = (name) => within(screen.getByRole('list', { name: 'Requisition progress' })).getByText(name).closest('li').className;

describe('login screen', () => {
  it('rejects a wrong password with a clear message, then signs in', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Sign in' });

    await user.type(screen.getByLabelText('Username'), 'requester');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password.');

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), PASSWORDS.requester);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Signed in as Sample Requester, Requester.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New requisition' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Suppliers' })).not.toBeInTheDocument(); // not in a requester's menu
  });
});

describe('a requisition that needs a purchase order', () => {
  it('goes from request to closed, with each role doing its own step', async () => {
    const user = userEvent.setup();

    // Requester raises it. Whiteboard markers are out of stock.
    const id = await createRequisition(user, 'Whiteboard Marker (box)', 7, 'Lecture rooms');

    // Requester validation: submitting nothing is refused on screen.
    await renderAs('requester', '/requisitions/new');
    await user.click(await screen.findByRole('button', { name: 'Submit requisition' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Line 1: choose an item');
    cleanup();

    // Procurement approves it.
    await renderAs('procurement', `/requisitions/${id}`);
    await screen.findByRole('heading', { name: `Requisition #${id}` });
    expect(screen.getByText('This is waiting for your decision.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByText(/Approved\. The store officer can issue/)).toBeInTheDocument());
    expect(stepClass('Approved')).toContain('current');

    // Stock is short, so the check says so, and issuing is disabled.
    expect(await screen.findByText('Enough?')).toBeInTheDocument();

    // Procurement raises the purchase order. Prices fill in from the supplier's price list.
    await user.click(screen.getByRole('button', { name: 'Raise purchase order' }));
    const dialog = await screen.findByRole('dialog', { name: 'Raise purchase order' });
    await within(dialog).findByRole('option', { name: 'Sample Office Supplies Ltd' });
    await user.click(within(dialog).getByRole('button', { name: 'Create purchase order' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Choose a supplier.');
    await user.selectOptions(within(dialog).getByLabelText('Supplier'), 'Sample Office Supplies Ltd');
    await waitFor(() => expect(within(dialog).getByLabelText('Unit price for Whiteboard Marker')).toHaveValue(3200));
    expect(within(dialog).getByText('Order total: ₦22,400.00')).toBeInTheDocument(); // 7 x 3,200
    await user.click(within(dialog).getByRole('button', { name: 'Create purchase order' }));
    const poHeading = await screen.findByRole('heading', { name: /Purchase order \d+/ });
    const poId = Number(/(\d+)/.exec(poHeading.textContent)[1]);
    expect(within(poHeading.closest('header')).getByText('Ordered')).toBeInTheDocument(); // status mark in the page header
    cleanup();

    // Store officer records an over-delivery (refused), then the real delivery.
    await renderAs('store', `/purchase-orders/${poId}`);
    await screen.findByRole('heading', { name: `Purchase order ${poId}` });
    const received = screen.getByLabelText('Received for Whiteboard Marker');
    await user.type(received, '9');
    await user.click(screen.getByRole('button', { name: 'Record receipt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('only 7 still outstanding');
    await user.clear(received);
    await user.type(received, '7');
    await user.click(screen.getByRole('button', { name: 'Record receipt' }));
    await waitFor(() => expect(screen.getAllByText('Delivered').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Record receipt' })).not.toBeInTheDocument();
    cleanup();

    // Store officer issues it from the new stock.
    await renderAs('store', `/requisitions/${id}`);
    await screen.findByRole('heading', { name: `Requisition #${id}` });
    await user.click(await screen.findByRole('button', { name: 'Issue from stock' }));
    await user.click(screen.getByRole('button', { name: 'Confirm issue' }));
    await waitFor(() => expect(screen.getByText(/The items have been issued/)).toBeInTheDocument());
    expect(stepClass('Ordered')).toBe('done'); // it really went through the order step
    expect(stepClass('Delivered')).toContain('current');
    cleanup();

    // Requester confirms and it closes.
    await renderAs('requester', `/requisitions/${id}`);
    await user.click(await screen.findByRole('button', { name: 'Confirm received and close' }));
    await waitFor(() => expect(screen.getByText('This requisition is complete.')).toBeInTheDocument());
    expect(stepClass('Closed')).toContain('final');
    expect(screen.queryByRole('button', { name: 'Confirm received and close' })).not.toBeInTheDocument();
  });
});

describe('a requisition filled straight from stock', () => {
  it('skips the order step and shows that on the progress track', async () => {
    const user = userEvent.setup();
    const id = await createRequisition(user, 'A4 Printing Paper (ream)', 1, 'Test run');

    await renderAs('procurement', `/requisitions/${id}`);
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    await screen.findByText(/Approved\. The store officer can issue/);
    cleanup();

    await renderAs('store', `/requisitions/${id}`);
    await screen.findByRole('heading', { name: `Requisition #${id}` });
    await user.click(await screen.findByRole('button', { name: 'Issue from stock' }));
    await user.click(screen.getByRole('button', { name: 'Confirm issue' }));
    await waitFor(() => expect(screen.getByText(/The items have been issued/)).toBeInTheDocument());
    expect(stepClass('Ordered')).toContain('skipped');
    expect(screen.getByText('Not needed, issued from stock')).toBeInTheDocument();
  });
});

describe('rejection', () => {
  it('needs a reason, and the reason shows in the history', async () => {
    const user = userEvent.setup();
    const id = await createRequisition(user, 'Extension Cable (piece)', 2, 'Spare cables');

    await renderAs('procurement', `/requisitions/${id}`);
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reject requisition' });
    expect(within(dialog).getByRole('button', { name: 'Reject requisition' })).toBeDisabled(); // no reason yet
    await user.type(within(dialog).getByLabelText('Reason for rejecting'), 'Use the existing spare stock');
    await user.click(within(dialog).getByRole('button', { name: 'Reject requisition' }));
    await waitFor(() => expect(screen.getByText('This requisition was rejected. Raise a new one if it is still needed.')).toBeInTheDocument());
    expect(screen.getByText('Use the existing spare stock')).toBeInTheDocument();
    expect(stepClass('Rejected')).toContain('rejected');
  });
});

describe('access rules and the other pages', () => {
  it('keeps a requester out of staff pages', async () => {
    await renderAs('requester', '/suppliers');
    expect(await screen.findByText(/You do not have access to this page/)).toBeInTheDocument();
  });

  it('shows the store officer stock with low-stock marks, and lets them open batches', async () => {
    const user = userEvent.setup();
    await renderAs('store', '/inventory');
    await screen.findByRole('heading', { name: 'Inventory' });
    expect(await screen.findByText('A4 Printing Paper')).toBeInTheDocument();
    expect(screen.getAllByText('Low').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Batches for A4 Printing Paper' }));
    const dialog = await screen.findByRole('dialog', { name: 'A4 Printing Paper: stock batches' });
    expect(await within(dialog).findByText('Adjust stock')).toBeInTheDocument();
  });

  it('shows procurement the inventory without edit controls', async () => {
    await renderAs('procurement', '/inventory');
    await screen.findByText('A4 Printing Paper');
    expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument();
  });

  it('lets the procurement officer open reports and shows the totals', async () => {
    await renderAs('procurement', '/reports');
    await screen.findByRole('heading', { name: 'Reports' });
    expect(await screen.findByText(/requisitions in this period/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
  });

  it('shows the administrator users and the audit log', async () => {
    await renderAs('admin', '/users');
    expect(await screen.findByText('Sample Requester')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add user' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate Sample Administrator' })).not.toBeInTheDocument(); // cannot deactivate yourself
    cleanup();

    await renderAs('admin', '/audit-log');
    await screen.findByRole('heading', { name: 'Audit log' });
    expect((await screen.findAllByText('stock issued')).length).toBeGreaterThan(0);
  });

  it('shows each role the right home queues', async () => {
    await renderAs('procurement', '/');
    expect(await screen.findByText('Waiting for your decision')).toBeInTheDocument();
    cleanup();
    await renderAs('store', '/');
    expect(await screen.findByText('Approved, ready to check and issue')).toBeInTheDocument();
  });
});
