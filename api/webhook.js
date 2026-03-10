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
  
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    // 2. Força a leitura do Body, mesmo que a Vercel receba como texto
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) { console.log('Body não é JSON'); }
    }

    console.log("🔔 Webhook Recebido! Body:", JSON.stringify(body));
    console.log("🔔 Webhook Recebido! Query:", JSON.stringify(req.query));

    let dataId = null;

    // 3. Procura o ID em todas as estruturas possíveis que o MP usa (IPN ou Webhook)
    if (body?.data?.id) dataId = body.data.id;
    else if (req.query?.['data.id']) dataId = req.query['data.id'];
    else if (req.query?.id) dataId = req.query.id;
    else if (body?.id) dataId = body.id;

    if (!dataId) {
      console.log("⚠️ ID não encontrado. Ignorando a notificação.");
      return res.status(200).send('OK - Sem ID');
    }

    // 4. Configurar Mercado Pago
    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || 'APP_USR-5026206862993903-010320-ffe5ffb1e7ac9902baee0d45126bfa08-2485490772';
    const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    const payment = new Payment(client);
    
    // 5. Procurar o estado oficial na API
    console.log(`🔎 Buscando detalhes do pagamento ID: ${dataId}...`);
    const paymentInfo = await payment.get({ id: dataId });
    
    console.log(`📊 Status real do pagamento ${dataId}: ${paymentInfo.status} | Ref: ${paymentInfo.external_reference}`);
    
    // 6. Atualizar Firebase se estiver pago
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

    // Retorna SEMPRE 200
    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Erro no processamento do webhook:', error.message || error);
    res.status(200).send('Erro interno processado.');
  }
}
