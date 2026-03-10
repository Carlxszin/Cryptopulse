import { MercadoPagoConfig, Payment } from 'mercadopago';
import admin from 'firebase-admin';

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
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { action, data } = req.body;

    // Se o pagamento for criado/atualizado, nós verificamos o status
    if (action === 'payment.created' || action === 'payment.updated') {
      const MP_ACCESS_TOKEN = 'APP_USR-5026206862993903-010320-ffe5ffb1e7ac9902baee0d45126bfa08-2485490772';
      const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
      const payment = new Payment(client);
      
      const paymentInfo = await payment.get({ id: data.id });
      
      if (paymentInfo.status === 'approved') {
        const externalRef = paymentInfo.external_reference; 
        
        // 1. O webhook atualiza no Firestore para 'approved'
        // 2. O Frontend, que está ouvindo o onSnapshot, entende na hora e muda a tela!
        await db.collection('orders').doc(externalRef).update({
          status: 'approved',
          approvedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 3. AQUI entraria a lógica de integração com a API da TIM/VIVO/etc. para enviar o saldo.
        console.log(`Recarga ${externalRef} finalizada!`);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Webhook Error');
  }
}
