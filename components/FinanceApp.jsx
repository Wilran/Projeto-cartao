"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, CreditCard, Target, PiggyBank,
  Plus, Trash2, Moon, Sun, Calendar, AlertTriangle, ChevronRight,
  DollarSign, Home, LineChart as LineChartIcon, Award, X, Check,
  FileUp, Loader2,
} from "lucide-react";

/* ---------------------------------------------------------------------
   CONFIG
--------------------------------------------------------------------- */

const CATEGORIES = [
  "Alimentação", "Combustível", "Transporte", "Lazer", "Compras",
  "Moradia", "Saúde", "Educação", "Investimentos", "Viagens", "Outros",
];

const CATEGORY_COLORS = {
  "Alimentação": "#F59E0B", "Combustível": "#6366F1", "Transporte": "#0EA5E9",
  "Lazer": "#EC4899", "Compras": "#8B5CF6", "Moradia": "#10B981",
  "Saúde": "#EF4444", "Educação": "#14B8A6", "Investimentos": "#22C55E",
  "Viagens": "#F97316", "Outros": "#64748B",
};

const INVESTMENT_TYPES = ["CDB", "Tesouro Direto", "Ações", "Fundos", "Criptomoedas", "Poupança"];

const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------------------------------------------------------------------
   CATEGORIZAÇÃO AUTOMÁTICA (por palavras-chave no nome do lançamento)
--------------------------------------------------------------------- */

const CATEGORY_KEYWORDS = {
  "Alimentação": ["ifood", "rappi", "supermercado", "mercado", "restaurante", "padaria",
    "lanchonete", "acougue", "açougue", "hortifruti", "pizzaria", "burguer", "hamburgueria",
    "atacadao", "atacadão", "carrefour", "extra", "pao de acucar", "pão de açúcar", "assai", "assaí"],
  "Combustível": ["posto", "shell", "ipiranga", "petrobras", "br mania", "ale combust", "combustivel", "combustível"],
  "Transporte": ["uber", "99app", "99 app", "cabify", "taxi", "táxi", "metro", "metrô",
    "onibus", "ônibus", "estacionamento", "pedagio", "pedágio", "sem parar", "conectcar"],
  "Lazer": ["netflix", "spotify", "disney", "hbo", "max play", "amazon prime", "prime video",
    "cinema", "ingresso", "steam", "playstation", "xbox", "bar ", "balada", "cervejaria"],
  "Compras": ["amazon", "mercado livre", "mercadolivre", "shopee", "shein", "aliexpress",
    "magazine luiza", "magalu", "americanas", "casas bahia", "renner", "riachuelo", "loja"],
  "Moradia": ["condominio", "condomínio", "aluguel", "energia", "enel", "cemig", "light",
    "sabesp", "copasa", "agua", "água", "gas", "gás", "internet", "vivo fibra", "claro net"],
  "Saúde": ["farmacia", "farmácia", "drogaria", "droga raia", "drogasil", "unimed", "hapvida",
    "plano de saude", "plano de saúde", "clinica", "clínica", "laboratorio", "laboratório"],
  "Educação": ["udemy", "alura", "faculdade", "curso", "mensalidade escolar", "livraria",
    "colegio", "colégio", "escola"],
  "Viagens": ["latam", "gol linhas", "azul linhas", "decolar", "booking", "airbnb", "hotel", "pousada"],
};

function guessCategory(description) {
  const d = (description || "").toLowerCase();
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => d.includes(w))) return cat;
  }
  return "Outros";
}

/* ---------------------------------------------------------------------
   LEITURA DE PDF DA FATURA (pdf.js carregado sob demanda)
--------------------------------------------------------------------- */

let pdfjsLoadPromise = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsLoadPromise) return pdfjsLoadPromise;
  pdfjsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("Não foi possível carregar o leitor de PDF."));
    document.head.appendChild(script);
  });
  return pdfjsLoadPromise;
}

function parseBRLNumber(str) {
  const clean = str.replace(/[Rr]\$/g, "").trim().replace(/\./g, "").replace(",", ".");
  return parseFloat(clean);
}

// Extrai lançamentos do texto bruto da fatura: linhas com data + descrição + valor
function extractPurchasesFromText(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const results = [];
  const lineRegex = /(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.{3,60}?)\s+(-?R?\$?\s?-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;

  for (const line of lines) {
    const match = line.match(lineRegex);
    if (!match) continue;
    const [, date, rawName, rawValue] = match;
    const value = parseBRLNumber(rawValue);
    if (!Number.isFinite(value) || value <= 0) continue; // ignora pagamentos/estornos negativos
    const name = rawName.replace(/\s{2,}/g, " ").trim();
    if (!name || /^total|^saldo|^limite|^pagamento/i.test(name)) continue;
    results.push({ id: uid(), date, name, value, category: guessCategory(name), include: true });
  }
  // remove duplicatas óbvias (mesma data+nome+valor)
  const seen = new Set();
  return results.filter((r) => {
    const key = `${r.date}|${r.name}|${r.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function extractTextFromPdf(file, pdfjsLib) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // agrupa itens por linha (mesma posição vertical aproximada)
    const rows = {};
    content.items.forEach((item) => {
      const y = Math.round(item.transform[5]);
      rows[y] = rows[y] || [];
      rows[y].push(item);
    });
    const orderedY = Object.keys(rows).map(Number).sort((a, b) => b - a);
    orderedY.forEach((y) => {
      const row = rows[y].sort((a, b) => a.transform[4] - b.transform[4]);
      fullText += row.map((i) => i.str).join(" ") + "\n";
    });
  }
  return fullText;
}

const currency = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const monthLabel = (ym) => {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
};

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Diferença em meses entre dois "YYYY-MM" (b - a)
function monthDiff(a, b) {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

// Uma compra parcelada "aparece" na fatura de vários meses seguidos a partir do mês da compra
function installmentValueInMonth(purchase, ym) {
  const diff = monthDiff(purchase.month, ym);
  const installments = purchase.installments || 1;
  if (diff < 0 || diff >= installments) return 0;
  return Number(purchase.value) / installments;
}

const DEFAULT_DATA = {
  soldoHistory: [],
  expenses: [],
  extraIncome: [],
  cards: [],
  goals: [],
  investments: [],
};

/* ---------------------------------------------------------------------
   PERSISTENCE
--------------------------------------------------------------------- */

const STORAGE_KEY = "financas-dados";

function useFinanceData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setData(raw ? JSON.parse(raw) : DEFAULT_DATA);
    } catch {
      setData(DEFAULT_DATA);
    } finally {
      setLoading(false);
    }
  }, []);

  const persist = useCallback((next) => {
    setData(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, []);

  return { data, setData: persist, loading, saveError };
}

/* ---------------------------------------------------------------------
   SMALL UI PRIMITIVES
--------------------------------------------------------------------- */

function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border transition-colors ${className}`}
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      {children}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent, sub }) {
  return (
    <Card className="p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>{label}</span>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: accent + "1A" }}
        >
          <Icon size={16} style={{ color: accent }} />
        </div>
      </div>
      <div className="text-xl font-bold" style={{ color: "var(--text)" }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "var(--muted)" }}>{sub}</div>}
    </Card>
  );
}

function Button({ children, onClick, variant = "primary", className = "", type = "button", disabled }) {
  const styles = {
    primary: { background: "var(--accent)", color: "#fff" },
    ghost: { background: "transparent", color: "var(--text)", border: "1px solid var(--border)" },
    danger: { background: "transparent", color: "var(--red)" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-transform active:scale-95 disabled:opacity-50 ${className}`}
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span style={{ color: "var(--muted)" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  background: "var(--input)",
  border: "1px solid var(--border)",
  color: "var(--text)",
};

function Input(props) {
  return (
    <input
      {...props}
      style={inputStyle}
      className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
    />
  );
}

function Select(props) {
  return (
    <select
      {...props}
      style={inputStyle}
      className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
    />
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--card)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base" style={{ color: "var(--text)" }}>{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: "var(--muted)" }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
      <Icon size={28} style={{ color: "var(--muted)" }} />
      <p className="text-sm" style={{ color: "var(--muted)" }}>{text}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------
   DERIVED CALCULATIONS
--------------------------------------------------------------------- */

function useComputed(data) {
  return useMemo(() => {
    const month = currentMonth();
    const soldoDoMes = data.soldoHistory
      .filter((s) => s.month === month)
      .reduce((sum, s) => sum + Number(s.value), 0);
    const soldoTotalAllTime = data.soldoHistory.reduce((sum, s) => sum + Number(s.value), 0);

    const extraDoMes = data.extraIncome
      .filter((e) => e.date?.slice(0, 7) === month)
      .reduce((sum, e) => sum + Number(e.value), 0);

    const gastosDoMes = data.expenses.filter((e) => e.date?.slice(0, 7) === month);
    const totalGasto = gastosDoMes.reduce((sum, e) => sum + Number(e.value), 0);

    const totalReceita = soldoDoMes + extraDoMes;
    const saldoDisponivel = totalReceita - totalGasto;

    const totalInvestido = data.investments.reduce((sum, i) => sum + Number(i.value), 0);
    const totalMetas = data.goals.reduce((sum, g) => sum + Number(g.current), 0);
    const economiaDoMes = Math.max(saldoDisponivel, 0);

    const faturaAtual = data.cards.reduce((sum, c) => {
      const compras = c.purchases || [];
      return sum + compras.reduce((s, p) => s + installmentValueInMonth(p, month), 0);
    }, 0);

    const porCategoria = CATEGORIES.map((cat) => ({
      name: cat,
      value: gastosDoMes.filter((e) => e.category === cat).reduce((s, e) => s + Number(e.value), 0),
    })).filter((c) => c.value > 0);

    // últimos 6 meses para gráfico de evolução
    const meses = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const receitas =
        data.soldoHistory.filter((s) => s.month === ym).reduce((s, x) => s + Number(x.value), 0) +
        data.extraIncome.filter((e) => e.date?.slice(0, 7) === ym).reduce((s, x) => s + Number(x.value), 0);
      const despesas = data.expenses
        .filter((e) => e.date?.slice(0, 7) === ym)
        .reduce((s, x) => s + Number(x.value), 0);
      meses.push({ mes: monthLabel(ym), receitas, despesas });
    }

    const patrimonio = totalInvestido + Math.max(saldoDisponivel, 0);

    return {
      month, soldoDoMes, extraDoMes, totalReceita, totalGasto, saldoDisponivel,
      totalInvestido, totalMetas, economiaDoMes, faturaAtual, porCategoria,
      evolucaoMensal: meses, patrimonio, soldoTotalAllTime,
    };
  }, [data]);
}

/* ---------------------------------------------------------------------
   TABS: DASHBOARD
--------------------------------------------------------------------- */

function Dashboard({ data, c, onNavigate }) {
  const pieData = c.porCategoria.length
    ? c.porCategoria
    : [{ name: "Sem gastos ainda", value: 1 }];

  const proximasContas = [...data.expenses]
    .filter((e) => new Date(e.date) >= new Date(new Date().toDateString()))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Wallet} label="Saldo disponível" value={currency(c.saldoDisponivel)} accent="#2563EB" />
        <StatCard icon={DollarSign} label="Soldo do mês" value={currency(c.soldoDoMes)} accent="#16A34A" />
        <StatCard icon={TrendingDown} label="Gasto no mês" value={currency(c.totalGasto)} accent="#DC2626" />
        <StatCard icon={CreditCard} label="Fatura atual" value={currency(c.faturaAtual)} accent="#F59E0B" />
        <StatCard icon={PiggyBank} label="Economia do mês" value={currency(c.economiaDoMes)} accent="#16A34A" />
        <StatCard icon={TrendingUp} label="Investido" value={currency(c.totalInvestido)} accent="#0EA5E9" />
        <StatCard icon={Award} label="Patrimônio" value={currency(c.patrimonio)} accent="#8B5CF6" />
        <StatCard icon={Target} label="Em metas" value={currency(c.totalMetas)} accent="#EC4899" />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>
            Gastos por categoria (mês atual)
          </h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[entry.name] || "#94A3B8"} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => currency(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {pieData.map((cat) => (
              <span key={cat.name} className="text-xs flex items-center gap-1" style={{ color: "var(--muted)" }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: CATEGORY_COLORS[cat.name] || "#94A3B8" }} />
                {cat.name}
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>
            Receitas x despesas (últimos 6 meses)
          </h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={c.evolucaoMensal}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--muted)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} width={40} />
                <Tooltip formatter={(v) => currency(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="receitas" name="Receitas" fill="#16A34A" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas" fill="#DC2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text)" }}>
            <Calendar size={16} /> Próximos lançamentos
          </h3>
          <button onClick={() => onNavigate("despesas")} className="text-xs flex items-center gap-1" style={{ color: "var(--accent)" }}>
            Ver todos <ChevronRight size={14} />
          </button>
        </div>
        {proximasContas.length === 0 ? (
          <EmptyState icon={Calendar} text="Nenhum lançamento futuro cadastrado." />
        ) : (
          <div className="flex flex-col gap-2">
            {proximasContas.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{e.name}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {new Date(e.date).toLocaleDateString("pt-BR")} · {e.category}
                  </p>
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--red)" }}>-{currency(e.value)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------
   TABS: SOLDO
--------------------------------------------------------------------- */

function SoldoTab({ data, setData, c }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ type: "Soldo base", value: "", month: currentMonth() });

  const add = () => {
    if (!form.value) return;
    setData({ ...data, soldoHistory: [...data.soldoHistory, { id: uid(), ...form, value: Number(form.value) }] });
    setForm({ type: "Soldo base", value: "", month: currentMonth() });
    setModal(false);
  };

  const remove = (id) => setData({ ...data, soldoHistory: data.soldoHistory.filter((s) => s.id !== id) });

  const sorted = [...data.soldoHistory].sort((a, b) => (a.month < b.month ? 1 : -1));

  const chartData = useMemo(() => {
    const byMonth = {};
    data.soldoHistory.forEach((s) => {
      byMonth[s.month] = (byMonth[s.month] || 0) + Number(s.value);
    });
    return Object.entries(byMonth)
      .sort()
      .slice(-6)
      .map(([m, v]) => ({ mes: monthLabel(m), valor: v }));
  }, [data.soldoHistory]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={DollarSign} label="Soldo deste mês" value={currency(c.soldoDoMes)} accent="#16A34A" />
        <StatCard icon={TrendingUp} label="Total histórico" value={currency(c.soldoTotalAllTime)} accent="#0EA5E9" />
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Evolução salarial</h3>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--muted)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} width={40} />
              <Tooltip formatter={(v) => currency(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="valor" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Histórico de lançamentos</h3>
        <Button onClick={() => setModal(true)}><Plus size={15} /> Novo lançamento</Button>
      </div>

      <Card className="p-2">
        {sorted.length === 0 ? (
          <EmptyState icon={DollarSign} text="Cadastre seu soldo, aumentos, adicionais ou descontos." />
        ) : (
          sorted.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-3 py-2.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{s.type}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{monthLabel(s.month)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold" style={{ color: s.value < 0 ? "var(--red)" : "var(--green)" }}>
                  {currency(s.value)}
                </span>
                <button onClick={() => remove(s.id)} style={{ color: "var(--muted)" }}><Trash2 size={15} /></button>
              </div>
            </div>
          ))
        )}
      </Card>

      {modal && (
        <Modal title="Novo lançamento de soldo" onClose={() => setModal(false)}>
          <div className="flex flex-col gap-3">
            <Field label="Tipo">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {["Soldo base", "Aumento", "Adicional", "Desconto"].map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Valor (use negativo para descontos)">
              <Input type="number" placeholder="0,00" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </Field>
            <Field label="Mês de referência">
              <Input type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
            </Field>
            <Button onClick={add} className="mt-2"><Check size={15} /> Salvar</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   TABS: DESPESAS
--------------------------------------------------------------------- */

function DespesasTab({ data, setData }) {
  const [modal, setModal] = useState(false);
  const [filterCat, setFilterCat] = useState("Todas");
  const [form, setForm] = useState({
    name: "", value: "", category: "Alimentação", payment: "Débito",
    date: new Date().toISOString().slice(0, 10), notes: "", installments: 1,
  });

  const add = () => {
    if (!form.name || !form.value) return;
    setData({ ...data, expenses: [...data.expenses, { id: uid(), ...form, value: Number(form.value) }] });
    setForm({ name: "", value: "", category: "Alimentação", payment: "Débito", date: new Date().toISOString().slice(0, 10), notes: "", installments: 1 });
    setModal(false);
  };

  const remove = (id) => setData({ ...data, expenses: data.expenses.filter((e) => e.id !== id) });

  const filtered = [...data.expenses]
    .filter((e) => filterCat === "Todas" || e.category === filterCat)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="w-auto">
          <option>Todas</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Button onClick={() => setModal(true)}><Plus size={15} /> Nova despesa</Button>
      </div>

      <Card className="p-2">
        {filtered.length === 0 ? (
          <EmptyState icon={TrendingDown} text="Nenhuma despesa cadastrada ainda." />
        ) : (
          filtered.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-3 py-2.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[e.category] }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{e.name}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {new Date(e.date).toLocaleDateString("pt-BR")} · {e.category} · {e.payment}
                    {e.installments > 1 ? ` · ${e.installments}x` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold" style={{ color: "var(--red)" }}>-{currency(e.value)}</span>
                <button onClick={() => remove(e.id)} style={{ color: "var(--muted)" }}><Trash2 size={15} /></button>
              </div>
            </div>
          ))
        )}
      </Card>

      {modal && (
        <Modal title="Nova despesa" onClose={() => setModal(false)}>
          <div className="flex flex-col gap-3">
            <Field label="Nome"><Input placeholder="Ex: Supermercado" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Valor"><Input type="number" placeholder="0,00" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoria">
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Forma de pagamento">
                <Select value={form.payment} onChange={(e) => setForm({ ...form, payment: e.target.value })}>
                  {["Débito", "Crédito", "Pix", "Dinheiro", "Boleto"].map((p) => <option key={p}>{p}</option>)}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              <Field label="Parcelas"><Input type="number" min={1} value={form.installments} onChange={(e) => setForm({ ...form, installments: e.target.value })} /></Field>
            </div>
            <Field label="Observações"><Input placeholder="Opcional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <Button onClick={add} className="mt-2"><Check size={15} /> Salvar</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   TABS: CARTÃO
--------------------------------------------------------------------- */

function CartaoTab({ data, setData }) {
  const [modal, setModal] = useState(null); // 'card' | 'purchase'
  const [activeCard, setActiveCard] = useState(null);
  const [cardForm, setCardForm] = useState({ name: "", limit: "", closingDay: "", dueDay: "" });
  const [purchaseForm, setPurchaseForm] = useState({
    name: "", value: "", installments: 1, kind: "Nacional", category: "Outros",
    month: currentMonth(), date: new Date().toISOString().slice(0, 10),
  });
  const [importState, setImportState] = useState({ status: "idle", error: "", items: [], cardId: null });

  const addCard = () => {
    if (!cardForm.name || !cardForm.limit) return;
    setData({ ...data, cards: [...data.cards, { id: uid(), ...cardForm, purchases: [] }] });
    setCardForm({ name: "", limit: "", closingDay: "", dueDay: "" });
    setModal(null);
  };

  const removeCard = (id) => setData({ ...data, cards: data.cards.filter((c) => c.id !== id) });

  const addPurchase = () => {
    if (!purchaseForm.name || !purchaseForm.value || !activeCard) return;
    setData({
      ...data,
      cards: data.cards.map((c) =>
        c.id === activeCard ? { ...c, purchases: [...(c.purchases || []), { id: uid(), ...purchaseForm }] } : c
      ),
    });
    setPurchaseForm({ name: "", value: "", installments: 1, kind: "Nacional", category: "Outros", month: currentMonth(), date: new Date().toISOString().slice(0, 10) });
    setModal(null);
  };

  const startImport = async (cardId, file) => {
    if (!file) return;
    setImportState({ status: "loading", error: "", items: [], cardId });
    try {
      const pdfjsLib = await loadPdfJs();
      const text = await extractTextFromPdf(file, pdfjsLib);
      const items = extractPurchasesFromText(text);
      if (items.length === 0) {
        setImportState({
          status: "error",
          error: "Não consegui identificar lançamentos automaticamente nesse PDF. O layout desse extrato pode ser diferente do esperado — você pode adicionar as compras manualmente.",
          items: [], cardId,
        });
        return;
      }
      setImportState({ status: "review", error: "", items, cardId });
    } catch (err) {
      setImportState({ status: "error", error: err.message || "Erro ao ler o PDF.", items: [], cardId });
    }
  };

  const updateImportItem = (id, patch) =>
    setImportState((s) => ({ ...s, items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));

  const confirmImport = () => {
    const toAdd = importState.items.filter((it) => it.include);
    if (toAdd.length === 0 || !importState.cardId) {
      setImportState({ status: "idle", error: "", items: [], cardId: null });
      return;
    }
    setData({
      ...data,
      cards: data.cards.map((c) =>
        c.id === importState.cardId
          ? {
              ...c,
              purchases: [
                ...(c.purchases || []),
                ...toAdd.map((it) => ({
                  id: uid(), name: it.name, value: it.value, installments: 1,
                  kind: "Fatura importada", category: it.category,
                  month: currentMonth(), date: new Date().toISOString().slice(0, 10),
                })),
              ],
            }
          : c
      ),
    });
    setImportState({ status: "idle", error: "", items: [], cardId: null });
  };

  const removePurchase = (cardId, purchaseId) =>
    setData({
      ...data,
      cards: data.cards.map((c) =>
        c.id === cardId ? { ...c, purchases: c.purchases.filter((p) => p.id !== purchaseId) } : c
      ),
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setModal("card")}><Plus size={15} /> Novo cartão</Button>
      </div>

      {data.cards.length === 0 ? (
        <Card className="p-4"><EmptyState icon={CreditCard} text="Cadastre seu primeiro cartão de crédito." /></Card>
      ) : (
        data.cards.map((card) => {
          const faturaAtual = (card.purchases || [])
            .reduce((s, p) => s + installmentValueInMonth(p, currentMonth()), 0);
          const usado = (card.purchases || []).reduce((s, p) => s + Number(p.value), 0);
          const disponivel = Math.max(Number(card.limit) - usado, 0);

          const categoriasFatura = CATEGORIES.map((cat) => ({
            name: cat,
            value: (card.purchases || [])
              .filter((p) => (p.category || "Outros") === cat)
              .reduce((s, p) => s + installmentValueInMonth(p, currentMonth()), 0),
          })).filter((c) => c.value > 0);

          const isImportingThisCard = importState.cardId === card.id && importState.status !== "idle";

          return (
            <Card key={card.id} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>{card.name}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Fecha dia {card.closingDay} · Vence dia {card.dueDay}
                  </p>
                </div>
                <button onClick={() => removeCard(card.id)} style={{ color: "var(--muted)" }}><Trash2 size={16} /></button>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-xl p-2.5" style={{ background: "var(--input)" }}>
                  <p className="text-[11px]" style={{ color: "var(--muted)" }}>Fatura atual</p>
                  <p className="text-sm font-bold" style={{ color: "var(--red)" }}>{currency(faturaAtual)}</p>
                </div>
                <div className="rounded-xl p-2.5" style={{ background: "var(--input)" }}>
                  <p className="text-[11px]" style={{ color: "var(--muted)" }}>Limite disponível</p>
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{currency(disponivel)}</p>
                </div>
                <div className="rounded-xl p-2.5" style={{ background: "var(--input)" }}>
                  <p className="text-[11px]" style={{ color: "var(--muted)" }}>Limite total</p>
                  <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{currency(card.limit)}</p>
                </div>
              </div>

              {categoriasFatura.length > 0 && (
                <div className="mb-3">
                  <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--muted)" }}>Fatura do mês por categoria</p>
                  <div style={{ height: 130 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categoriasFatura} dataKey="value" nameKey="name" innerRadius={32} outerRadius={55} paddingAngle={2}>
                          {categoriasFatura.map((entry, i) => (
                            <Cell key={i} fill={CATEGORY_COLORS[entry.name] || "#94A3B8"} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => currency(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {categoriasFatura.map((cat) => (
                      <span key={cat.name} className="text-[11px] flex items-center gap-1" style={{ color: "var(--muted)" }}>
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: CATEGORY_COLORS[cat.name] || "#94A3B8" }} />
                        {cat.name} · {currency(cat.value)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <button
                  onClick={() => { setActiveCard(card.id); setModal("purchase"); }}
                  className="text-xs font-medium flex items-center gap-1"
                  style={{ color: "var(--accent)" }}
                >
                  <Plus size={13} /> Adicionar compra
                </button>

                <label
                  className="text-xs font-medium flex items-center gap-1 cursor-pointer"
                  style={{ color: "var(--accent)" }}
                >
                  {isImportingThisCard && importState.status === "loading" ? (
                    <><Loader2 size={13} className="animate-spin" /> Lendo PDF...</>
                  ) : (
                    <><FileUp size={13} /> Importar fatura em PDF</>
                  )}
                  <input
                    type="file" accept="application/pdf" className="hidden"
                    onChange={(e) => { startImport(card.id, e.target.files?.[0]); e.target.value = ""; }}
                  />
                </label>
              </div>

              {isImportingThisCard && importState.status === "error" && (
                <p className="text-xs mb-2 flex items-start gap-1.5" style={{ color: "var(--red)" }}>
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {importState.error}
                </p>
              )}

              {(card.purchases || []).length > 0 && (
                <div className="flex flex-col gap-1 mt-1">
                  {[...card.purchases].sort((a, b) => new Date(b.date) - new Date(a.date)).map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-1.5 border-t" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[p.category || "Outros"] }} />
                        <div>
                          <p className="text-xs font-medium" style={{ color: "var(--text)" }}>{p.name}</p>
                          <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                            {p.category || "Outros"} · {p.kind}
                            {p.installments > 1
                              ? ` · parcela ${Math.min(Math.max(monthDiff(p.month, currentMonth()) + 1, 1), p.installments)}/${p.installments} de ${currency(p.value / p.installments)}`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: "var(--red)" }}>-{currency(p.value)}</span>
                        <button onClick={() => removePurchase(card.id, p.id)} style={{ color: "var(--muted)" }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })
      )}

      {modal === "card" && (
        <Modal title="Novo cartão" onClose={() => setModal(null)}>
          <div className="flex flex-col gap-3">
            <Field label="Nome do cartão"><Input placeholder="Ex: Nubank" value={cardForm.name} onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })} /></Field>
            <Field label="Limite total"><Input type="number" placeholder="0,00" value={cardForm.limit} onChange={(e) => setCardForm({ ...cardForm, limit: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dia de fechamento"><Input type="number" min={1} max={31} value={cardForm.closingDay} onChange={(e) => setCardForm({ ...cardForm, closingDay: e.target.value })} /></Field>
              <Field label="Dia de vencimento"><Input type="number" min={1} max={31} value={cardForm.dueDay} onChange={(e) => setCardForm({ ...cardForm, dueDay: e.target.value })} /></Field>
            </div>
            <Button onClick={addCard} className="mt-2"><Check size={15} /> Salvar</Button>
          </div>
        </Modal>
      )}

      {modal === "purchase" && (
        <Modal title="Adicionar compra" onClose={() => setModal(null)}>
          <div className="flex flex-col gap-3">
            <Field label="Descrição"><Input placeholder="Ex: iFood" value={purchaseForm.name} onChange={(e) => setPurchaseForm({ ...purchaseForm, name: e.target.value })} /></Field>
            <Field label="Valor total"><Input type="number" placeholder="0,00" value={purchaseForm.value} onChange={(e) => setPurchaseForm({ ...purchaseForm, value: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Parcelas"><Input type="number" min={1} value={purchaseForm.installments} onChange={(e) => setPurchaseForm({ ...purchaseForm, installments: e.target.value })} /></Field>
              <Field label="Tipo">
                <Select value={purchaseForm.kind} onChange={(e) => setPurchaseForm({ ...purchaseForm, kind: e.target.value })}>
                  {["Nacional", "Internacional", "Pix no crédito", "Assinatura"].map((k) => <option key={k}>{k}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Categoria">
              <Select value={purchaseForm.category} onChange={(e) => setPurchaseForm({ ...purchaseForm, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Data da compra"><Input type="date" value={purchaseForm.date} onChange={(e) => setPurchaseForm({ ...purchaseForm, date: e.target.value })} /></Field>
            <Button onClick={addPurchase} className="mt-2"><Check size={15} /> Salvar</Button>
          </div>
        </Modal>
      )}

      {importState.status === "review" && (
        <Modal
          title={`Revisar lançamentos (${importState.items.length})`}
          onClose={() => setImportState({ status: "idle", error: "", items: [], cardId: null })}
        >
          <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
            Confira os valores e categorias detectados automaticamente. Desmarque o que não deve ser importado ou ajuste a categoria antes de confirmar.
          </p>
          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto pr-1">
            {importState.items.map((it) => (
              <div key={it.id} className="rounded-xl p-2.5 flex flex-col gap-2" style={{ background: "var(--input)" }}>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox" checked={it.include}
                    onChange={(e) => updateImportItem(it.id, { include: e.target.checked })}
                  />
                  <Input
                    value={it.name}
                    onChange={(e) => updateImportItem(it.id, { name: e.target.value })}
                    className="flex-1"
                  />
                  <span className="text-[11px] shrink-0" style={{ color: "var(--muted)" }}>{it.date}</span>
                </div>
                <div className="flex items-center gap-2 pl-6">
                  <Select
                    value={it.category}
                    onChange={(e) => updateImportItem(it.id, { category: e.target.value })}
                    className="flex-1"
                  >
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </Select>
                  <Input
                    type="number"
                    value={it.value}
                    onChange={(e) => updateImportItem(it.id, { value: Number(e.target.value) })}
                    className="w-28"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4 text-sm">
            <span style={{ color: "var(--muted)" }}>
              Total selecionado: <strong style={{ color: "var(--text)" }}>
                {currency(importState.items.filter((i) => i.include).reduce((s, i) => s + Number(i.value), 0))}
              </strong>
            </span>
          </div>
          <Button onClick={confirmImport} className="mt-3 w-full">
            <Check size={15} /> Confirmar importação
          </Button>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   TABS: METAS
--------------------------------------------------------------------- */

function MetasTab({ data, setData }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", target: "", current: "0", deadline: "" });

  const add = () => {
    if (!form.name || !form.target) return;
    setData({ ...data, goals: [...data.goals, { id: uid(), ...form, target: Number(form.target), current: Number(form.current) }] });
    setForm({ name: "", target: "", current: "0", deadline: "" });
    setModal(false);
  };

  const remove = (id) => setData({ ...data, goals: data.goals.filter((g) => g.id !== id) });

  const addProgress = (id, amount) =>
    setData({
      ...data,
      goals: data.goals.map((g) => (g.id === id ? { ...g, current: Math.max(0, Number(g.current) + amount) } : g)),
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setModal(true)}><Plus size={15} /> Nova meta</Button>
      </div>

      {data.goals.length === 0 ? (
        <Card className="p-4"><EmptyState icon={Target} text="Crie metas como reserva de emergência, viagens ou um carro novo." /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {data.goals.map((g) => {
            const pct = Math.min(100, (g.current / g.target) * 100 || 0);
            return (
              <Card key={g.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>{g.name}</p>
                  <button onClick={() => remove(g.id)} style={{ color: "var(--muted)" }}><Trash2 size={14} /></button>
                </div>
                <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
                  {currency(g.current)} de {currency(g.target)} {g.deadline && `· meta: ${new Date(g.deadline).toLocaleDateString("pt-BR")}`}
                </p>
                <div className="w-full h-2 rounded-full overflow-hidden mb-2" style={{ background: "var(--input)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>{pct.toFixed(0)}% concluído</span>
                  <div className="flex gap-1">
                    <button onClick={() => addProgress(g.id, 100)} className="text-xs px-2 py-1 rounded-lg" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>+R$100</button>
                    <button onClick={() => addProgress(g.id, 500)} className="text-xs px-2 py-1 rounded-lg" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>+R$500</button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title="Nova meta" onClose={() => setModal(false)}>
          <div className="flex flex-col gap-3">
            <Field label="Nome da meta"><Input placeholder="Ex: Reserva de emergência" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Valor alvo"><Input type="number" placeholder="0,00" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></Field>
            <Field label="Valor já poupado"><Input type="number" placeholder="0,00" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /></Field>
            <Field label="Prazo (opcional)"><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></Field>
            <Button onClick={add} className="mt-2"><Check size={15} /> Salvar</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   TABS: INVESTIMENTOS
--------------------------------------------------------------------- */

function InvestimentosTab({ data, setData, c }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ type: "CDB", name: "", value: "", profitability: "" });

  const add = () => {
    if (!form.name || !form.value) return;
    setData({ ...data, investments: [...data.investments, { id: uid(), ...form, value: Number(form.value) }] });
    setForm({ type: "CDB", name: "", value: "", profitability: "" });
    setModal(false);
  };

  const remove = (id) => setData({ ...data, investments: data.investments.filter((i) => i.id !== id) });

  const byType = INVESTMENT_TYPES.map((t) => ({
    name: t,
    value: data.investments.filter((i) => i.type === t).reduce((s, i) => s + Number(i.value), 0),
  })).filter((t) => t.value > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={TrendingUp} label="Total investido" value={currency(c.totalInvestido)} accent="#0EA5E9" />
        <StatCard icon={Award} label="Patrimônio total" value={currency(c.patrimonio)} accent="#8B5CF6" />
      </div>

      {byType.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Carteira por tipo</h3>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byType} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted)" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} width={90} />
                <Tooltip formatter={(v) => currency(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="#0EA5E9" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={() => setModal(true)}><Plus size={15} /> Novo investimento</Button>
      </div>

      <Card className="p-2">
        {data.investments.length === 0 ? (
          <EmptyState icon={TrendingUp} text="Cadastre CDBs, Tesouro, ações, fundos, cripto ou poupança." />
        ) : (
          data.investments.map((i) => (
            <div key={i.id} className="flex items-center justify-between px-3 py-2.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{i.name}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {i.type}{i.profitability ? ` · ${i.profitability}% rent.` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold" style={{ color: "var(--green)" }}>{currency(i.value)}</span>
                <button onClick={() => remove(i.id)} style={{ color: "var(--muted)" }}><Trash2 size={15} /></button>
              </div>
            </div>
          ))
        )}
      </Card>

      {modal && (
        <Modal title="Novo investimento" onClose={() => setModal(false)}>
          <div className="flex flex-col gap-3">
            <Field label="Tipo">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {INVESTMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Nome / instituição"><Input placeholder="Ex: CDB Banco X" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Valor investido"><Input type="number" placeholder="0,00" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>
            <Field label="Rentabilidade % (opcional)"><Input type="number" placeholder="Ex: 12" value={form.profitability} onChange={(e) => setForm({ ...form, profitability: e.target.value })} /></Field>
            <Button onClick={add} className="mt-2"><Check size={15} /> Salvar</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   ROOT APP
--------------------------------------------------------------------- */

const TABS = [
  { id: "dashboard", label: "Início", icon: Home },
  { id: "soldo", label: "Soldo", icon: DollarSign },
  { id: "despesas", label: "Despesas", icon: TrendingDown },
  { id: "cartao", label: "Cartão", icon: CreditCard },
  { id: "metas", label: "Metas", icon: Target },
  { id: "investimentos", label: "Invest.", icon: LineChartIcon },
];

export default function FinanceApp() {
  const { data, setData, loading, saveError } = useFinanceData();
  const [tab, setTab] = useState("dashboard");
  const [dark, setDark] = useState(false);

  const c = useComputed(data || DEFAULT_DATA);

  const theme = dark
    ? { bg: "#0B1424", card: "#111C30", text: "#F1F5F9", muted: "#94A3B8", border: "#1E293B", input: "#0F1A2C", accent: "#3B82F6", green: "#22C55E", red: "#F87171" }
    : { bg: "#F4F6F8", card: "#FFFFFF", text: "#0B1E3D", muted: "#64748B", border: "#E2E8F0", input: "#F8FAFC", accent: "#0B1E3D", green: "#16A34A", red: "#DC2626" };

  const cssVars = {
    "--bg": theme.bg, "--card": theme.card, "--text": theme.text, "--muted": theme.muted,
    "--border": theme.border, "--input": theme.input, "--accent": theme.accent,
    "--green": theme.green, "--red": theme.red,
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-400">Carregando seus dados financeiros...</p>
      </div>
    );
  }

  return (
    <div style={{ ...cssVars, background: "var(--bg)" }} className="min-h-screen w-full font-sans">
      <div className="max-w-5xl mx-auto px-4 py-5 pb-24 sm:pb-8">
        <header className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
              <Wallet size={20} /> Painel financeiro
            </h1>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saveError && (
              <span className="flex items-center gap-1 text-xs" style={{ color: theme.red }}>
                <AlertTriangle size={13} /> erro ao salvar
              </span>
            )}
            <button
              onClick={() => setDark(!dark)}
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        <nav className="hidden sm:flex gap-1 mb-5 p-1 rounded-xl w-fit" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
              style={{
                background: tab === t.id ? "var(--accent)" : "transparent",
                color: tab === t.id ? "#fff" : "var(--text)",
              }}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </nav>

        {tab === "dashboard" && <Dashboard data={data} c={c} onNavigate={setTab} />}
        {tab === "soldo" && <SoldoTab data={data} setData={setData} c={c} />}
        {tab === "despesas" && <DespesasTab data={data} setData={setData} />}
        {tab === "cartao" && <CartaoTab data={data} setData={setData} />}
        {tab === "metas" && <MetasTab data={data} setData={setData} />}
        {tab === "investimentos" && <InvestimentosTab data={data} setData={setData} c={c} />}
      </div>

      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around py-2 z-40"
        style={{ background: "var(--card)", borderTop: "1px solid var(--border)" }}
      >
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className="flex flex-col items-center gap-0.5 px-2 py-1">
            <t.icon size={18} style={{ color: tab === t.id ? "var(--accent)" : "var(--muted)" }} />
            <span className="text-[10px]" style={{ color: tab === t.id ? "var(--accent)" : "var(--muted)" }}>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
