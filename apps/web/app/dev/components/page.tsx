"use client";

// Component gallery: every shared component in every state, for review. Static demonstration only: the values below are labelled examples (the documented
// arithmetic example), not data, and nothing here talks to a backend. The stage rail demonstrates the Confirmed rule with an explicit, labelled
// verified-read-back switch; real screens never set it, because no endpoint reports one.
import { useState, type ReactNode } from "react";
import { Button } from "../../../components/ui/Button.tsx";
import { Amount, AvatarStack, Identifier, PageTabs, SegmentTabs, Table, type Col, type Sort } from "../../../components/ui/Data.tsx";
import { AccessDenied, EmptyState, ErrorState, InlineError, NotSupported, PermissionState, Skeleton, StatusMark } from "../../../components/ui/Feedback.tsx";
import { FailureNote } from "../../../components/settlement/FailureNote.tsx";
import { FAILED_FIXTURES } from "../../../lib/fixtures/failed-states.ts";
import { ApprovalBlock, NextAction, SignatureBlock, StageRail, Stepper } from "../../../components/ui/Flow.tsx";
import { ChoiceGroup, InputCard, SelectField, TextAreaField, TextField } from "../../../components/ui/Form.tsx";
import { CommandPanel, Dialog, Popover, SidePanel } from "../../../components/ui/Overlays.tsx";
import { Banner, Card, DataCard, DerivedNote, Panel, SampleDataBanner, StatGrid, TestnetStrip } from "../../../components/ui/Surfaces.tsx";
import type { ExecState } from "../../../lib/stages.ts";

type Row = { id: string; debtor: string; creditor: string; amount: string; asset: string };
const ROWS: Row[] = [
  { id: "7f3a9c1e5b2d48a6c0e1f9d3b7a5c2e4", debtor: "Party A", creditor: "Party B", amount: "100", asset: "USD" },
  { id: "1b2c3d4e5f60718293a4b5c6d7e8f901", debtor: "Party B", creditor: "Party C", amount: "80", asset: "USD" },
  { id: "aa11bb22cc33dd44ee55ff6677889900", debtor: "Party C", creditor: "Party A", amount: "70", asset: "USD" },
];
const COLS: Col<Row>[] = [
  { id: "id", header: "Id", cell: (r) => <Identifier value={r.id} />, hideBelow: "md" },
  { id: "debtor", header: "Debtor", cell: (r) => r.debtor, sortable: true },
  { id: "creditor", header: "Creditor", cell: (r) => r.creditor, sortable: true },
  { id: "amount", header: "Amount", align: "right", sortable: true, cell: (r) => <Amount value={r.amount} asset={r.asset} /> },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="text-title font-medium">{title}</h2>
      {children}
    </section>
  );
}
const Label = ({ children }: { children: ReactNode }) => <p className="mb-2 text-label uppercase tracking-wide text-muted">{children}</p>;

export default function ComponentsPage() {
  const [seg, setSeg] = useState<"all" | "active">("all");
  const [sort, setSort] = useState<Sort | null>({ id: "amount", dir: "desc" });
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(false);
  const [destructive, setDestructive] = useState(false);
  const [side, setSide] = useState(false);
  const [cmd, setCmd] = useState(false);
  const [exec, setExec] = useState<ExecState | "none">("submitted");
  const [readBack, setReadBack] = useState(false);
  const [vis, setVis] = useState("private");
  const sorted = [...ROWS].sort((a, b) => (sort ? (sort.dir === "asc" ? 1 : -1) * (sort.id === "amount" ? Number(a.amount) - Number(b.amount) : String(a[sort.id as "debtor"]).localeCompare(String(b[sort.id as "debtor"]))) : 0));

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-[1200px] space-y-16 px-4 py-10 sm:px-6">
      <header>
        <p className="text-label uppercase tracking-wide text-muted">Development</p>
        <h1 className="text-title font-medium">Component gallery</h1>
        <p className="mt-1 max-w-prose text-body text-muted">Every shared component in every state. Values are labelled examples (the documented arithmetic example), not data. No backend is called.</p>
      </header>

      <Section id="buttons" title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="primary" loading>Loading</Button>
          <Button variant="primary" disabled>Disabled</Button>
          <Button variant="secondary" disabled>Disabled</Button>
        </div>
        <div className="max-w-sm"><Button variant="primary" size="lg">Full-width primary, 52px</Button></div>
        <PermissionState reason="Only administrators can do this."><Button variant="primary" disabled>Create session</Button></PermissionState>
      </Section>

      <Section id="surfaces" title="Surfaces and figures">
        <Panel className="space-y-4">
          <Label>Panel (#f0f0f0, 24px)</Label>
          <div className="grid gap-4 md:grid-cols-2">
            <Card><Label>Card (white, 16px)</Label><p className="text-body">Card content.</p></Card>
            <DataCard label="Data card" value="No data" note="The one headline figure on a screen." />
          </div>
          <StatGrid items={[{ label: "Label", value: "Value" }, { label: "Net position", value: <Amount value="30" asset="USD" /> }, { label: "Participants", value: "No data", hint: "Not available" }]} />
        </Panel>
        <Banner>Banner: a full-width #f0f0f0 strip.</Banner>
        <TestnetStrip />
        <SampleDataBanner />
        <DerivedNote shown={10} total={23} capped />
        <DerivedNote shown={3} total={3} capped={false} />
      </Section>

      <Section id="forms" title="Form fields">
        <div className="grid max-w-3xl gap-4 md:grid-cols-2">
          <TextField id="g-default" label="Default" placeholder="Placeholder" />
          <TextField id="g-value" label="With value" defaultValue="Alpha Bank" />
          <TextField id="g-hint" label="With hint" hint="A hint under the field." />
          <TextField id="g-error" label="With error" defaultValue="x" error="Enter at least 2 characters." />
          <TextField id="g-disabled" label="Disabled" defaultValue="Locked" disabled />
          <InputCard label="Amount with asset selector" htmlFor="g-amount" right={<span className="rounded-btn bg-ink-10 px-2 py-1 text-body">USD</span>}><input id="g-amount" inputMode="numeric" className="num w-full bg-transparent text-action font-medium outline-none" defaultValue="1200" /></InputCard>
          <SelectField id="g-select" label="Select"><option>Bank</option><option>Fintech</option></SelectField>
          <TextAreaField id="g-area" label="Text area" />
          <ChoiceGroup legend="Choice group" name="g-vis" value={vis} onChange={setVis} options={[{ value: "private", label: "Private", hint: "Members only." }, { value: "public", label: "Public" }]} />
        </div>
        <InlineError>An inline error: red text and a cross, in plain language.</InlineError>
      </Section>

      <Section id="status" title="Status marks">
        <div className="grid max-w-md gap-2">
          <StatusMark kind="progress">In progress (outlined dot, muted)</StatusMark>
          <StatusMark kind="done">Done (filled dot)</StatusMark>
          <StatusMark kind="action">Needs my action (filled dot, 500 text)</StatusMark>
          <StatusMark kind="failed">Failed, refused or rejected</StatusMark>
          <StatusMark kind="unsupported">Not supported</StatusMark>
        </div>
      </Section>

      <Section id="states" title="Loading, empty, error, permission and not supported">
        <div className="grid gap-4 md:grid-cols-2">
          <div><Label>Skeleton (same layout as loaded)</Label><div className="space-y-3"><Skeleton className="h-16" /><Skeleton lines={3} /></div></div>
          <div><Label>Empty state (same size as filled)</Label><EmptyState message="No clearing sessions yet. Create one to begin." action={<Button variant="primary" disabled>Create session</Button>} /></div>
          <div><Label>Error with retry</Label><ErrorState title="Could not load sessions" message="Tobin could not be reached. Check your connection and try again." retry={<Button>Try again</Button>} /></div>
          <div><Label>Whole-page denial</Label><AccessDenied title="You don't have access to this session" message="Ask an administrator of the organization to add you as a member." /></div>
          <div className="md:col-span-2"><Label>Not supported (#626262, never mocked)</Label><NotSupported feature="Cross-organization sessions" reason="The backend records sessions inside one organization. Inviting another organization and joining are not supported." /></div>
        </div>
      </Section>

      <Section id="data" title="Tables, tabs, identifiers and avatars">
        <SegmentTabs label="Filter" value={seg} onChange={setSeg} items={[{ value: "all", label: "All" }, { value: "active", label: "Active" }]} />
        <PageTabs label="Page tabs" activeHref="/dev/components" items={[{ href: "/dev/components", label: "Overview" }, { href: "/dev/components#x", label: "Sessions", count: 3 }, { href: "/dev/components#y", label: "Obligations" }]} />
        <Table columns={COLS} data={sorted} getRowId={(r) => r.id} sort={sort} onSortChange={setSort} page={page} pageSize={2} total={ROWS.length} onPageChange={setPage} rowLabel="Obligations" empty={<EmptyState message="No obligations." />} />
        <div className="grid gap-4 md:grid-cols-3">
          <div><Label>Loading</Label><Table columns={COLS} data={[]} getRowId={(r) => r.id} loading empty={null} /></div>
          <div><Label>Error</Label><Table columns={COLS} data={[]} getRowId={(r) => r.id} error="The table could not be loaded." onRetry={() => {}} empty={null} /></div>
          <div><Label>Empty</Label><Table columns={COLS} data={[]} getRowId={(r) => r.id} empty={<EmptyState message="No obligations." />} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <span><Label>Identifier (copy on click)</Label><Identifier value="7f3a9c1e5b2d48a6c0e1f9d3b7a5c2e4" /></span>
          <span><Label>Amount (always with its asset)</Label><Amount value="1200000" asset="USD" /></span>
          <span><Label>AvatarStack</Label><AvatarStack names={["Party A", "Party B", "Party C", "Party D", "Party E", "Party F"]} /></span>
        </div>
      </Section>

      <Section id="flow" title="Stepper, next action, approvals, signatures, stage rail">
        <Panel className="space-y-4">
          <Card><Stepper currentIndex={3} subLabel="Netting completed, awaiting approval" applicationOnly /></Card>
          <Card><Stepper currentIndex={1} stoppedAt={1} stoppedLabel="Cancelled" subLabel="Stopped at Participation" /></Card>
          <NextAction title="Review the calculation" who="Reviewers of the organization" forYou />
        </Panel>
        <div className="grid items-start gap-4 md:grid-cols-2">
          <ApprovalBlock decisions={[{ id: "d1", reviewer: "Reviewer 1", decision: "approved", at: "2026-01-01T10:00:00Z" }, { id: "d2", reviewer: "Reviewer 2", decision: "rejected", at: "2026-01-01T11:00:00Z", reason: "Amounts do not match the invoices." }]} note="Approval recorded in Tobin. This is not an on-chain signature." />
          <SignatureBlock signers={[]} threshold={2} />
        </div>
        <Card>
          <Label>Transaction stage rail (labelled demonstration)</Label>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-body">
            <label className="flex items-center gap-2">Backend state
              <select className="rounded-btn border border-field bg-card px-2 py-1 max-md:min-h-11" value={exec} onChange={(e) => setExec(e.target.value as ExecState | "none")}>
                {["none", "awaiting-signer", "signed", "submitted", "confirmed", "reconciled", "failed", "unknown-outcome"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={readBack} onChange={(e) => setReadBack(e.target.checked)} />Verified read-back (never set by real screens)</label>
          </div>
          <StageRail input={{ state: exec === "none" ? undefined : exec, verifiedReadBack: readBack }} evidence={{ prepared: "Instruction id", signed: "Signer", submitted: "Hash", confirmed: "Ledger number" }} />
        </Card>
      </Section>

      <Section id="failed-states" title="Failed execution states (fixture)">
        <p className="mb-3 text-body text-muted" role="note">FIXTURE. The real backend cannot reach these states over HTTP today, so no real screen shows them. They are rendered here from invented data so the layout is reviewed before a route exists.</p>
        <div className="grid gap-4 md:grid-cols-3">
          {FAILED_FIXTURES.map((x) => <div key={x.state}><p className="mb-1 text-label uppercase tracking-wide text-muted">Fixture: {x.state}</p><FailureNote state={x.state} events={x.events} /></div>)}
        </div>
      </Section>

      <Section id="overlays" title="Dialog, side panel, popover, command panel">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => { setDestructive(false); setDialog(true); }}>Open dialog</Button>
          <Button variant="destructive" onClick={() => { setDestructive(true); setDialog(true); }}>Open destructive dialog</Button>
          <Button onClick={() => setSide(true)}>Open side panel</Button>
          <Button onClick={() => setCmd(true)}>Open command panel</Button>
          <Popover trigger={({ open, toggle, ref, id }) => <button ref={ref} type="button" onClick={toggle} aria-expanded={open} aria-controls={id} className="h-9 max-md:h-11 rounded-btn bg-ink-10 px-3 text-body font-medium hover:bg-ink-15">Open popover</button>}>{() => <p className="p-3 text-body">A popover panel: closes on Escape and on an outside click.</p>}</Popover>
        </div>
        <Dialog open={dialog} onClose={() => setDialog(false)} title={destructive ? "Reject operation?" : "Create session?"} description="A dialog states the consequence and uses an action-labelled primary button." destructive={destructive} primary={{ label: destructive ? "Reject operation" : "Create session", onClick: () => setDialog(false) }}>
          <StatGrid columns={2} items={[{ label: "Session", value: "Example" }, { label: "Network", value: "Stellar Testnet" }]} />
        </Dialog>
        <SidePanel open={side} onClose={() => setSide(false)} title="Record detail"><p className="text-body text-muted">A 480px drawer for detail without leaving the list.</p></SidePanel>
        <CommandPanel open={cmd} onClose={() => setCmd(false)} commands={[{ id: "a", label: "Overview", group: "Go to", onSelect: () => {} }, { id: "b", label: "Clearing Sessions", group: "Go to", onSelect: () => {} }]} notice="Not supported: searching records. This panel only jumps between pages." />
      </Section>
    </main>
  );
}
