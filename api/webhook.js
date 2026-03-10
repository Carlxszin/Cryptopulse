import { MercadoPagoConfig, Payment } from 'mercadopago';
import admin from 'firebase-admin';

// Inicializa o Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

export default async function handler(req, res) {
  // 1. Previne bloqueios (CORS) e responde às validações do Mercado Pago
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).send('Webhook Online');
  
  // Se não for POST (nem OPTIONS/GET), então recusa.
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    console.log("🔔 Webhook Acionado! Método:", req.method, "Query:", req.query);

    let dataId = null;

    // 2. Extração à prova de falhas: procura o ID do pagamento em todos os locais possíveis
    if (req.body && req.body.data && req.body.data.id) {
      dataId = req.body.data.id;
    } else if (req.query && req.query['data.id']) {
      dataId = req.query['data.id'];
    } else if (req.query && req.query.id) {
      dataId = req.query.id;
    } else if (req.body && req.body.id) {
      dataId = req.body.id;
    }

    if (!dataId) {
      console.log("⚠️ ID não encontrado no payload. Ignorando a notificação.");
      return res.status(200).send('OK - Sem ID');
    }

    // 3. Configurar Mercado Pago
    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || 'APP_USR-5026206862993903-010320-ffe5ffb1e7ac9902baee0d45126bfa08-2485490772';
    const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    const payment = new Payment(client);
    
    // 4. Procurar o estado oficial na API
    const paymentInfo = await payment.get({ id: dataId });
    console.log(`📊 Status real do pagamento ${dataId}: ${paymentInfo.status}`);
    
    // 5. Se estiver aprovado, atualiza a base de dados em tempo real
    if (paymentInfo.status === 'approved') {
      const externalRef = paymentInfo.external_reference; 
      
      if (externalRef) {
        await db.collection('orders').doc(externalRef).update({
          status: 'approved',
          approvedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`✅ Sucesso! Encomenda ${externalRef} aprovada no banco de dados.`);
      } else {
        console.log("⚠️ Pagamento aprovado, mas sem external_reference.");
      }
    }

    // Retorna SEMPRE 200 para fechar a chamada com sucesso
    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Erro no processamento do webhook:', error);
    // Mesmo com erro interno, dizemos ao MP que recebemos para ele não travar
    res.status(200).send('Erro interno processado.');
  }
}
