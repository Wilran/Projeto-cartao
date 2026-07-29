import pdf from 'pdf-parse';
import multer from 'multer';

export const config = { api: { bodyParser: false } };
const upload = multer({ storage: multer.memoryStorage() });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido' });

  upload.single('fatura')(req, res, async (err) => {
    if (err) return res.status(500).json({ error: 'Erro no upload do arquivo' });

    try {
      const data = await pdf(req.file.buffer);
      const text = data.text;
      const transacoes = [];
      
      // Captura: (Data Ex: 26 JUN) + (Descrição limpa) + (Valor Ex: R$ 65,61 ou -R$ 7,15)
      const regex = /(\d{2}\s[A-Z]{3})\s+([\w\s*.\-/'áéíóúãõç]+)\s+(-?R\$\s[\d.,]+)/g;
      
      let match;
      while ((match = regex.exec(text)) !== null) {
        const dataTransacao = match[1].trim();
        let descricao = match[2].replace(/0335|1663|2018|\n/g, '').trim();
        const valorString = match[3].replace(/\s/g, '').replace('R$', '').replace('.', '').replace(',', '.');
        const valor = parseFloat(valorString);

        if (descricao && !isNaN(valor) && !descricao.includes("Pagamento em")) {
          transacoes.push({ data: dataTransacao, descricao, valor });
        }
      }
      res.status(200).json({ transacoes });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Falha ao processar o PDF' });
    }
  });
}
