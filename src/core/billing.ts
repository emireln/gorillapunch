export interface CreditPack { id: string; name: string; credits: number; amount: number }
export interface CreditWallet { balance: number }
export interface CreditEntry { id: string; delta: number; reason: string; created_at: string }
export interface CreditOrder {
  id: string; owner_id: string | null; pack_id: string; credits: number; amount: number; currency: string;
  status: 'pending' | 'paid' | 'expired' | 'failed'; payment_method: 'pix' | 'card';
  stripe_session_id: string | null; stripe_payment_intent: string | null; created_at: string;
  refunded_amount: number; revoked_credits: number;
}
export interface BillingSummary {
  wallet: CreditWallet; packs: CreditPack[]; costs: { quick: number; full: number };
  enabled: boolean; pix: boolean; unlimited: boolean; entries: CreditEntry[];
  orders: Pick<CreditOrder, 'id' | 'credits' | 'amount' | 'currency' | 'status' | 'created_at' | 'refunded_amount'>[];
}
export const defaultCreditPacks: CreditPack[] = [
  { id: 'starter', name: 'Starter', credits: 10, amount: 1500 },
  { id: 'builder', name: 'Builder', credits: 30, amount: 4500 },
  { id: 'launch', name: 'Launch', credits: 100, amount: 15000 },
];
export const formatBRL = (centavos: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100);
