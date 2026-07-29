import { useState } from 'react';
import { signOut } from 'next-auth/react';

export default function Dashboard({ user }) {
  const [file, setFile] = useState(null);
  const [transacoes, setTransacoes] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    
    const formData = new FormData();
    formData.append('fatura', file);

    const res = await fetch('/api/upload-fatura', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.transacoes) setTransacoes(data.transacoes);
    setLoading(false);
  };

  const exportarCSV = () => {
    const cabecalho = "Data,Descricao,Valor\n";
    const linhas = transacoes.map(t => `${t.data},"${t.descricao}",${t.valor}`).join("\n");
    const blob = new Blob([cabecalho + linhas], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "fatura_cartao_nubank.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto bg-white p-6 rounded-xl shadow">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <h1 className="text-2xl font-bold text-gray-800">Painel de Cartões</h1>
          <button onClick={() => signOut()} className="text-red-500 font-medium hover:underline">Sair da Conta</button>
        </div>
        
        <form onSubmit={handleUpload} className="mb-8 border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 transition p-8 rounded-lg text-center">
          <h3 className="text-lg font-medium text-gray-700 mb-2">Importar Fatura em PDF</h3>
          <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files[0])} className="mb-4 block mx-auto text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          <button type="submit" disabled={!file || loading} className="bg-blue-600 text-white px-6 py-2 rounded-lg disabled:opacity-50 font-medium shadow-sm hover:bg-blue-700 transition">
            {loading ? 'Processando arquivo...' : 'Ler Dados da Fatura'}
          </button>
        </form>

        {transacoes.length > 0 && (
          <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
              <h2 className="text-xl font-semibold text-gray-800">Transações Identificadas ({transacoes.length})</h2>
              <button onClick={exportarCSV} className="bg-green-600 hover:bg-green-700 transition text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm flex items-center gap-2">
                Exportar para Planilha (CSV)
              </button>
            </div>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-700">
                    <th className="p-3 border-b font-medium">Data</th>
                    <th className="p-3 border-b font-medium">Descrição</th>
                    <th className="p-3 border-b font-medium">Valor (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {transacoes.map((t, i) => (
                    <tr key={i} className="hover:bg-blue-50 transition border-b last:border-0">
                      <td className="p-3 text-gray-600 whitespace-nowrap">{t.data}</td>
                      <td className="p-3 text-gray-800 font-medium">{t.descricao}</td>
                      <td className={`p-3 font-semibold whitespace-nowrap ${t.valor < 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {t.valor < 0 ? '' : '-'}{Math.abs(t.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}