import { useEffect, useState, useCallback } from "react";
import { api } from "../api.js";
import { WizardStepIndicator } from "./wizard/WizardStepIndicator.js";
import { WizardStepIntro } from "./wizard/WizardStepIntro.js";
import { WizardStepCredentials } from "./wizard/WizardStepCredentials.js";
import { WizardStepInstall } from "./wizard/WizardStepInstall.js";
import { WizardStepAgent } from "./wizard/WizardStepAgent.js";
import { WizardStepDone } from "./wizard/WizardStepDone.js";
import { LinearLogo } from "./LinearLogo.js";

type WizardStep = 1 | 2 | 3 | 4 | 5;

const STEPS = [
  { label: "Intro" },
  { label: "Credentials" },
  { label: "Install" },
  { label: "Agent" },
  { label: "Done" },
];

const STORAGE_KEY = "companion_linear_wizard_state";

interface PersistedState {
  step: WizardStep;
  credentialsSaved: boolean;
  oauthConnected: boolean;
  agentName: string;
  createdAgentId: string | null;
}

function loadPersistedState(): PersistedState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function savePersistedState(state: PersistedState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable — silently ignore
  }
}

function clearPersistedState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function LinearAgentWizard() {
  const [step, setStep] = useState<WizardStep>(1);
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [oauthConnected, setOauthConnected] = useState(false);
  const [oauthError, setOauthError] = useState("");
  const [agentName, setAgentName] = useState("");
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: check OAuth status + restore persisted state + handle OAuth redirect
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1. Check URL hash for OAuth callback parameters
      const hash = window.location.hash;
      let oauthSuccess = false;
      let oauthErr = "";

      if (hash.includes("oauth_success=true")) {
        oauthSuccess = true;
        // Clean URL
        window.location.hash = "#/setup/linear-agent";
      } else if (hash.includes("oauth_error=")) {
        const match = hash.match(/oauth_error=([^&]*)/);
        oauthErr = decodeURIComponent(match?.[1] || "OAuth failed");
        window.location.hash = "#/setup/linear-agent";
      }

      // 2. Check server OAuth status
      let serverStatus = { configured: false, hasAccessToken: false, hasClientId: false, hasClientSecret: false, hasWebhookSecret: false };
      try {
        serverStatus = await api.getLinearOAuthStatus();
      } catch {
        // Server unreachable — continue with defaults
      }

      if (cancelled) return;

      const isConnected = oauthSuccess || serverStatus.hasAccessToken;
      const hasCreds = serverStatus.configured || serverStatus.hasClientId;

      setOauthConnected(isConnected);
      setCredentialsSaved(hasCreds);
      if (oauthErr) setOauthError(oauthErr);

      // 3. Restore persisted state from sessionStorage (for OAuth redirect return)
      const persisted = loadPersistedState();
      if (persisted) {
        // Coming back from OAuth redirect — merge persisted with server truth
        if (isConnected && persisted.step <= 3) {
          // OAuth just completed — advance to step 4
          setStep(4);
        } else {
          setStep(persisted.step);
        }
        if (persisted.agentName) setAgentName(persisted.agentName);
        if (persisted.createdAgentId) setCreatedAgentId(persisted.createdAgentId);
        clearPersistedState();
      } else {
        // No persisted state — determine starting step from server status
        if (isConnected) {
          setStep(4);
        } else if (hasCreds) {
          setStep(3);
        } else {
          setStep(1);
        }
      }

      setLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Build completed steps set
  const completedSteps = new Set<number>();
  if (credentialsSaved || oauthConnected) {
    completedSteps.add(1);
    completedSteps.add(2);
  }
  if (oauthConnected) {
    completedSteps.add(3);
  }
  if (createdAgentId) {
    completedSteps.add(4);
  }

  const goTo = useCallback((s: WizardStep) => setStep(s), []);

  // Persist state before OAuth redirect
  const handleBeforeRedirect = useCallback(() => {
    savePersistedState({
      step: 3,
      credentialsSaved,
      oauthConnected,
      agentName,
      createdAgentId,
    });
  }, [credentialsSaved, oauthConnected, agentName, createdAgentId]);

  const handleCredentialsSaved = useCallback(() => {
    setCredentialsSaved(true);
  }, []);

  const handleAgentCreated = useCallback((id: string, name: string) => {
    setCreatedAgentId(id);
    setAgentName(name);
    setStep(5);
  }, []);

  const handleFinish = useCallback(() => {
    clearPersistedState();
    window.location.hash = "#/agents";
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-cc-bg">
        <div className="text-sm text-cc-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-cc-bg text-cc-fg font-sans-ui antialiased overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-10 pb-safe">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <LinearLogo className="w-6 h-6 text-cc-fg" />
            <h1 className="text-xl font-semibold text-cc-fg">Linear Agent Setup</h1>
          </div>
          <button
            onClick={() => { window.location.hash = "#/integrations"; }}
            className="px-3 py-2 rounded-lg text-sm text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>

        {/* Step indicator */}
        <WizardStepIndicator
          steps={STEPS}
          currentStep={step}
          completedSteps={completedSteps}
        />

        {/* Step content */}
        <div className="bg-cc-card border border-cc-border rounded-xl p-5 sm:p-7">
          {step === 1 && (
            <WizardStepIntro onNext={() => goTo(2)} />
          )}
          {step === 2 && (
            <WizardStepCredentials
              onNext={() => goTo(3)}
              onBack={() => goTo(1)}
              credentialsSaved={credentialsSaved}
              onCredentialsSaved={handleCredentialsSaved}
            />
          )}
          {step === 3 && (
            <WizardStepInstall
              onNext={() => goTo(4)}
              onBack={() => goTo(2)}
              oauthConnected={oauthConnected}
              oauthError={oauthError}
              onBeforeRedirect={handleBeforeRedirect}
            />
          )}
          {step === 4 && (
            <WizardStepAgent
              onNext={handleAgentCreated}
              onBack={() => goTo(3)}
            />
          )}
          {step === 5 && (
            <WizardStepDone
              agentName={agentName}
              onFinish={handleFinish}
            />
          )}
        </div>
      </div>
    </div>
  );
}
