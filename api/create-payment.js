import { MercadoPagoConfig, Payment } from 'mercadopago';
import admin from 'firebase-admin';

// Inicializar Firebase Admin
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

// Única fonte da verdade para preços!
const CATALOG = {
  1: { value: 15, pay: 12, description: 'Recarga R$ 15,00 - 20% OFF' },
  2: { value: 20, pay: 15, description: 'Recarga R$ 20,00 - 25% OFF' },
  3: { value: 30, pay: 20, description: 'Recarga R$ 30,00 - 33% OFF' },
  4: { value: 40, pay: 30, description: 'Recarga R$ 40,00 - 25% OFF' },
  5: { value: 50, pay: 35, description: 'Recarga R$ 50,00 - 30% OFF' },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { packageId, phone, operator, userId } = req.body;
    
    const selectedPackage = CATALOG[packageId];
    if (!selectedPackage) return res.status(400).json({ error: 'Pacote inválido.' });

    // Configura SDK v2 do MP
    const MP_ACCESS_TOKEN = 'APP_USR-5026206862993903-010320-ffe5ffb1e7ac9902baee0d45126bfa08-2485490772';
    const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    const payment = new Payment(client);
    
    const paymentIdStr = `recarga_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // Criamos o URL garantindo que tem https:// (e deixamos o seu domínio fixo como segurança extra)
    const webhookUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/webhook` 
      : 'https://cryptopulse-kappa.vercel.app/api/webhook';

    // Criar PIX
    const paymentResponse = await payment.create({
      body: {
        transaction_amount: selectedPackage.pay,
        description: selectedPackage.description,
        payment_method_id: 'pix',
        payer: { email: 'contato@recargafast.com' },
        external_reference: paymentIdStr,
        notification_url: webhookUrl
      }
    });

    // Salvar como PENDENTE no Firestore
    await db.collection('orders').doc(paymentIdStr).set({
      packageId, phone, operator,
      pricePaid: selectedPackage.pay,
      status: 'pending',
      mpPaymentId: paymentResponse.id,
      userId: userId || 'anonymous',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      paymentId: paymentIdStr,
      qrCodeBase64: paymentResponse.point_of_interaction.transaction_data.qr_code_base64,
      qrCodeString: paymentResponse.point_of_interaction.transaction_data.qr_code
    });

  } catch (error) {
    console.error('Erro ao gerar pagamento:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
}
