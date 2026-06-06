export type ProblemType =
  | "fuite"
  | "electrique"
  | "traitement-eau"
  | "pompe"
  | "chauffage"
  | "clavier-ecran"
  | "filtration"
  | "bruit-anormal"
  | "autre";

export type ChoiceType = "intervention" | "devis" | "remote";

export type PaymentPlan = "photo" | "guided" | "premium" | "water";

export type DiagnosticStatus = "nouvelle" | "en analyse" | "devis envoyé" | "RDV demandé" | "terminé";

export type CustomerInfo = {
  name: string;
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  spaBrand: string;
  spaModel: string;
  spaYear: string;
  installationType: "interieur" | "exterieur" | "";
  powerSupply: "230V" | "400V" | "je ne sais pas" | "";
};

export type DiagnosticDraft = CustomerInfo & {
  problemType: ProblemType | "";
  answers: Record<string, string>;
  photos: Record<string, string>;
  choice: ChoiceType | "";
  paymentPlan: PaymentPlan | "";
  diagnosticId?: string;
};

export type Question = {
  id: string;
  label: string;
  type: "radio" | "text" | "number" | "textarea";
  required?: boolean;
  options?: string[];
  showWhen?: {
    questionId: string;
    equals: string;
  };
};

export type AdminDiagnostic = {
  id: string;
  created_at: string;
  status: DiagnosticStatus;
  problem_type: string;
  choice: string | null;
  payment_status: string | null;
  customer_email_status: string | null;
  customer_email_error: string | null;
  archived_at: string | null;
  customers: {
    name: string;
    phone: string;
    email: string;
    address: string;
    spa_brand: string;
    spa_model: string | null;
  } | null;
  diagnostic_answers: Array<{
    question_label: string;
    answer: string;
  }>;
  diagnostic_photos: Array<{
    photo_type: string;
    storage_path: string;
    public_url: string | null;
  }>;
};
