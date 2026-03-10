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
  // O Mercado Pago exige que respondamos rápido com um status 200 ou 201
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    console.log("🔔 Webhook Acionado! Payload recebido:", JSON.stringify(req.body));

    // O Mercado Pago pode enviar a notificação em formatos diferentes (Webhook vs IPN)
    const type = req.body.type || req.query.type;
    const action = req.body.action;
    const dataId = req.body.data?.id || req.query['data.id'];

    // Se for uma notificação de pagamento
    if (type === 'payment' || (action && action.startsWith('payment.'))) {
      
      if (!dataId) {
        console.log("⚠️ ID do pagamento não encontrado no payload.");
        return res.status(200).send('OK');
      }

      // Configurar Mercado Pago
      const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || 'APP_USR-5026206862993903-010320-ffe5ffb1e7ac9902baee0d45126bfa08-2485490772';
      const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
      const payment = new Payment(client);
      
      // Procurar o estado oficial deste pagamento no Mercado Pago
      const paymentInfo = await payment.get({ id: dataId });
      console.log(`📊 Status real do pagamento ${dataId}: ${paymentInfo.status}`);
      
      // Se estiver aprovado, avisamos o site!
      if (paymentInfo.status === 'approved') {
        const externalRef = paymentInfo.external_reference; 
        
        if (externalRef) {
          await db.collection('orders').doc(externalRef).update({
            status: 'approved',
            approvedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`✅ Sucesso! Encomenda ${externalRef} atualizada para aprovada no banco de dados.`);
        } else {
          console.log("⚠️ Pagamento aprovado, mas não tinha external_reference.");
        }
      }
    }

    // Retorna SEMPRE 200 para o Mercado Pago não bloquear a nossa API com tentativas
    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Erro no processamento do webhook:', error);
    res.status(200).send('Erro, mas recebido.');
  }
}
