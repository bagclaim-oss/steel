import { randomBytes } from "node:crypto";
import { FlyMachinesClient } from "./fly-machines.js";
import { FlyVolumesClient } from "./fly-volumes.js";
import { HetznerCloudClient } from "./hetzner-cloud.js";

/**
 * Plan-based resource configuration.
 */
const PLAN_CONFIGS = {
  starter: { cpus: 2, memory_mb: 2048, cpu_kind: "shared" as const, storage_gb: 10 },
  pro: { cpus: 4, memory_mb: 4096, cpu_kind: "shared" as const, storage_gb: 50 },
  enterprise: { cpus: 4, memory_mb: 8192, cpu_kind: "performance" as const, storage_gb: 100 },
} as const;

export type Plan = keyof typeof PLAN_CONFIGS;
export type InstanceProvider = "fly" | "hetzner";

export type ProvisionProgressFn = (step: string, label: string, status: "in_progress" | "done" | "error") => void;

interface ProvisionInput {
  organizationId: string;
  plan: Plan;
  region: string;
  hostname: string;
  loginUrl: string;
  tailscaleAuthKey?: string;
  onProgress?: ProvisionProgressFn;
}

interface ProvisionResult {
  flyMachineId: string;
  flyVolumeId: string;
  authSecret: string;
  hostname: string;
}

interface ProvisionerFlyConfig {
  provider: "fly";
  flyToken: string;
  flyAppName: string;
  companionImage: string;
}

interface ProvisionerHetznerConfig {
  provider: "hetzner";
  hetznerToken: string;
  companionImage: string;
  hetznerSshKeyId?: string;
  hetznerServerTypes?: Partial<Record<Plan, string>>;
}

type ProvisionerConfig = ProvisionerFlyConfig | ProvisionerHetznerConfig;

function makeVolumeName(hostname: string): string {
  // Fly volume names allow lowercase alphanumeric and underscores, max 30 chars.
  const safe = hostname
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const suffix = (safe || "instance").slice(0, 20);
  return `companion_${suffix}`;
}

function makeMachineName(hostname: string): string {
  // Fly machine names are best kept to lowercase alphanumeric + dashes.
  const safe = hostname
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = (safe || "instance").slice(0, 40);
  return `companion-${suffix}`;
}

function sanitizeCloudInitValue(value: string | undefined): string {
  return String(value || "").replace(/[\r\n]/g, "").trim();
}

/**
 * Orchestrates end-to-end instance provisioning:
 * 1. Create Fly Volume for persistent storage
 * 2. Create Fly Machine with the Companion image
 * 3. Wait for machine to start
 * 4. Return provisioned instance metadata
 */
export class Provisioner {
  private provider: InstanceProvider;
  private machines?: FlyMachinesClient;
  private volumes?: FlyVolumesClient;
  private hetzner?: HetznerCloudClient;
  private companionImage: string;
  private hetznerSshKeyId?: string;
  private hetznerServerTypes: Record<Plan, string>;

  constructor(flyToken: string, flyAppName: string, companionImage: string);
  constructor(config: ProvisionerConfig);
  constructor(
    flyTokenOrConfig: string | ProvisionerConfig,
    flyAppName?: string,
    companionImage?: string,
  ) {
    if (typeof flyTokenOrConfig === "string") {
      this.provider = "fly";
      this.machines = new FlyMachinesClient(flyTokenOrConfig, flyAppName!);
      this.volumes = new FlyVolumesClient(flyTokenOrConfig, flyAppName!);
      this.companionImage = companionImage!;
      this.hetznerServerTypes = {
        starter: "cpx11",
        pro: "cpx21",
        enterprise: "cpx31",
      };
      return;
    }

    this.provider = flyTokenOrConfig.provider;
    this.companionImage = flyTokenOrConfig.companionImage;
    this.hetznerServerTypes = {
      starter: "cpx11",
      pro: "cpx21",
      enterprise: "cpx31",
    };

    if (flyTokenOrConfig.provider === "fly") {
      this.machines = new FlyMachinesClient(flyTokenOrConfig.flyToken, flyTokenOrConfig.flyAppName);
      this.volumes = new FlyVolumesClient(flyTokenOrConfig.flyToken, flyTokenOrConfig.flyAppName);
      return;
    }

    this.hetznerServerTypes = {
      starter: flyTokenOrConfig.hetznerServerTypes?.starter || "cpx11",
      pro: flyTokenOrConfig.hetznerServerTypes?.pro || "cpx21",
      enterprise: flyTokenOrConfig.hetznerServerTypes?.enterprise || "cpx31",
    };
    this.hetzner = new HetznerCloudClient(flyTokenOrConfig.hetznerToken);
    this.hetznerSshKeyId = flyTokenOrConfig.hetznerSshKeyId;
  }

  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    if (this.provider === "hetzner") {
      return this.provisionHetzner(input);
    }

    const config = PLAN_CONFIGS[input.plan];
    const authSecret = randomBytes(32).toString("hex");
    const progress = input.onProgress ?? (() => {});

    // Step 1: Create volume
    progress("creating_volume", "Creating storage volume", "in_progress");
    const volume = await this.volumes!.createVolume({
      name: makeVolumeName(input.hostname),
      region: input.region,
      size_gb: config.storage_gb,
    });
    progress("creating_volume", "Creating storage volume", "done");

    // Step 2: Create machine
    const env: Record<string, string> = {
      NODE_ENV: "production",
      HOST: "0.0.0.0",
      COMPANION_HOME: "/data/companion",
      COMPANION_SESSION_DIR: "/data/sessions",
      COMPANION_AUTH_ENABLED: "1",
      COMPANION_AUTH_SECRET: authSecret,
      COMPANION_LOGIN_URL: input.loginUrl,
    };

    if (input.tailscaleAuthKey) {
      env.TAILSCALE_AUTH_KEY = input.tailscaleAuthKey;
    }

    progress("creating_machine", "Creating machine", "in_progress");
    let machine;
    try {
      machine = await this.machines!.createMachine({
        name: makeMachineName(input.hostname),
        region: input.region,
        config: {
          image: this.companionImage,
          guest: {
            cpus: config.cpus,
            memory_mb: config.memory_mb,
            cpu_kind: config.cpu_kind,
          },
          env,
          services: [
            {
              ports: [
                { port: 443, handlers: ["tls", "http"] },
                { port: 80, handlers: ["http"] },
              ],
              internal_port: 3456,
              protocol: "tcp",
              min_machines_running: 1,
            },
          ],
          mounts: [
            {
              volume: volume.id,
              path: "/data",
            },
          ],
          auto_stop: "off",
          auto_start: true,
        },
      });
      progress("creating_machine", "Creating machine", "done");

      // Step 3: Wait for machine to be running
      progress("waiting_start", "Waiting for machine to start", "in_progress");
      await this.machines!.waitForState(machine.id, "started", 90_000);
      progress("waiting_start", "Waiting for machine to start", "done");
    } catch (err) {
      // Clean up resources if machine creation/startup fails
      if (machine) {
        try { await this.machines!.destroyMachine(machine.id, true); } catch {}
      }
      try { await this.volumes!.deleteVolume(volume.id); } catch {}
      throw err;
    }

    // TODO: Persist authSecret to the instances table in the database so the
    // control plane can reissue tokens later (e.g. for the /token endpoint).
    // Currently only returned to the caller.

    return {
      flyMachineId: machine.id,
      flyVolumeId: volume.id,
      authSecret,
      hostname: input.hostname,
    };
  }

  private mapRegionToHetznerLocation(region: string): string {
    const normalized = region.trim().toLowerCase();
    if (normalized === "iad") return "ash";
    if (normalized === "cdg") return "fsn";
    if (normalized === "fra") return "fsn";
    if (normalized === "ams") return "nbg";
    return "ash";
  }

  private buildHetznerUserData(input: ProvisionInput, authSecret: string, volumeName: string): string {
    const loginUrl = sanitizeCloudInitValue(input.loginUrl);
    const tailscaleAuthKey = sanitizeCloudInitValue(input.tailscaleAuthKey);
    const env = [
      `NODE_ENV=production`,
      `HOST=0.0.0.0`,
      `COMPANION_HOME=/data/companion`,
      `COMPANION_SESSION_DIR=/data/sessions`,
      `COMPANION_AUTH_ENABLED=1`,
      `COMPANION_AUTH_SECRET=${authSecret}`,
      `COMPANION_LOGIN_URL=${loginUrl}`,
      tailscaleAuthKey ? `TAILSCALE_AUTH_KEY=${tailscaleAuthKey}` : "",
    ]
      .filter(Boolean)
      .map((line) => `      ${line}`)
      .join("\n");

    return `#cloud-config
runcmd:
  - apt-get update
  - apt-get install -y docker.io
  - systemctl enable docker
  - systemctl start docker
  - mkdir -p /data
  - DEV=/dev/disk/by-id/scsi-0HC_Volume_${volumeName}
  - if [ -b "$DEV" ]; then blkid "$DEV" || mkfs.ext4 -F "$DEV"; fi
  - if [ -b "$DEV" ]; then mountpoint -q /data || mount "$DEV" /data; fi
  - if [ -b "$DEV" ]; then grep -q "$DEV /data " /etc/fstab || echo "$DEV /data ext4 defaults,nofail 0 2" >> /etc/fstab; fi
  - mkdir -p /data/companion /data/sessions
  - chown -R 10001:10001 /data
  - systemctl daemon-reload
  - systemctl enable companion.service
  - systemctl restart companion.service
write_files:
  - path: /etc/companion.env
    permissions: "0600"
    content: |
${env}
  - path: /usr/local/bin/companion-run.sh
    permissions: "0755"
    content: |
      #!/usr/bin/env bash
      set -euo pipefail
      docker rm -f companion >/dev/null 2>&1 || true
      docker run -d --name companion --restart unless-stopped -p 80:3456 -v /data:/data --env-file /etc/companion.env ${this.companionImage}
  - path: /etc/systemd/system/companion.service
    permissions: "0644"
    content: |
      [Unit]
      Description=Companion Container
      After=docker.service network-online.target
      Wants=network-online.target

      [Service]
      Type=oneshot
      RemainAfterExit=yes
      ExecStart=/usr/local/bin/companion-run.sh
      ExecStop=/usr/bin/docker stop companion

      [Install]
      WantedBy=multi-user.target
  - path: /usr/local/bin/companion-rerun.sh
    permissions: "0755"
    content: |
      #!/usr/bin/env bash
      set -euo pipefail
      systemctl daemon-reload
      systemctl enable companion.service
      systemctl restart companion.service
  - path: /var/lib/cloud/scripts/per-boot/99-companion-rerun.sh
    permissions: "0755"
    content: |
      #!/usr/bin/env bash
      /usr/local/bin/companion-rerun.sh
`;
  }

  private async provisionHetzner(input: ProvisionInput): Promise<ProvisionResult> {
    const config = PLAN_CONFIGS[input.plan];
    const authSecret = randomBytes(32).toString("hex");
    const progress = input.onProgress ?? (() => {});
    const location = this.mapRegionToHetznerLocation(input.region);
    const volumeName = makeVolumeName(input.hostname || `${input.organizationId}-${Date.now()}`);

    progress("creating_volume", "Creating storage volume", "in_progress");
    const volume = await this.hetzner!.createVolume({
      name: volumeName,
      location,
      size: config.storage_gb,
      labels: {
        app: "companion",
        organization: input.organizationId,
      },
    });
    progress("creating_volume", "Creating storage volume", "done");

    progress("creating_machine", "Creating server", "in_progress");
    let serverId: number | null = null;
    try {
      const response = await this.hetzner!.createServer({
        name: makeMachineName(input.hostname || `${input.organizationId}-${Date.now()}`),
        server_type: this.hetznerServerTypes[input.plan],
        location,
        image: "ubuntu-24.04",
        volumes: [volume.id],
        user_data: this.buildHetznerUserData(input, authSecret, volume.name),
        ssh_keys: this.hetznerSshKeyId ? [this.hetznerSshKeyId] : undefined,
        labels: {
          app: "companion",
          organization: input.organizationId,
        },
      });
      serverId = response.server.id;
      if (response.action?.id) {
        await this.hetzner!.waitForAction(response.action.id, 120_000);
      }
      progress("creating_machine", "Creating server", "done");

      progress("waiting_start", "Waiting for server to start", "in_progress");
      const server = await this.hetzner!.waitForServerStatus(serverId, "running", 120_000);
      progress("waiting_start", "Waiting for server to start", "done");

      return {
        flyMachineId: String(serverId),
        flyVolumeId: String(volume.id),
        authSecret,
        hostname: input.hostname || server.public_net?.ipv4?.ip || "",
      };
    } catch (err) {
      if (serverId !== null) {
        try { await this.hetzner!.deleteServer(serverId); } catch {}
      }
      try { await this.hetzner!.deleteVolume(volume.id); } catch {}
      throw err;
    }
  }

  async deprovision(machineId: string, volumeId: string): Promise<void> {
    if (this.provider === "hetzner") {
      try {
        await this.hetzner!.powerOff(machineId);
      } catch {
        // Instance may already be stopped or removed.
      }
      await this.hetzner!.deleteServer(machineId);
      await this.hetzner!.deleteVolume(volumeId);
      return;
    }

    // Stop machine first
    try {
      await this.machines!.stopMachine(machineId);
      await this.machines!.waitForState(machineId, "stopped", 30_000);
    } catch {
      // Machine may already be stopped
    }

    // Destroy machine
    await this.machines!.destroyMachine(machineId, true);

    // Delete volume
    await this.volumes!.deleteVolume(volumeId);
  }

  async start(machineId: string): Promise<void> {
    if (this.provider === "hetzner") {
      const action = await this.hetzner!.powerOn(machineId);
      if (action?.id) {
        await this.hetzner!.waitForAction(action.id, 90_000);
      }
      await this.hetzner!.waitForServerStatus(machineId, "running", 90_000);
      return;
    }

    await this.machines!.startMachine(machineId);
    await this.machines!.waitForState(machineId, "started", 60_000);
  }

  async stop(machineId: string): Promise<void> {
    if (this.provider === "hetzner") {
      const action = await this.hetzner!.powerOff(machineId);
      if (action?.id) {
        await this.hetzner!.waitForAction(action.id, 90_000);
      }
      await this.hetzner!.waitForServerStatus(machineId, "off", 90_000);
      return;
    }

    await this.machines!.stopMachine(machineId);
    await this.machines!.waitForState(machineId, "stopped", 30_000);
  }

  async getStatus(machineId: string): Promise<string> {
    if (this.provider === "hetzner") {
      const server = await this.hetzner!.getServer(machineId);
      return server.status;
    }

    const machine = await this.machines!.getMachine(machineId);
    return machine.state;
  }

  async resize(machineId: string, plan: Plan): Promise<void> {
    if (this.provider === "hetzner") {
      const offAction = await this.hetzner!.powerOff(machineId);
      if (offAction?.id) {
        await this.hetzner!.waitForAction(offAction.id, 90_000);
      }
      await this.hetzner!.waitForServerStatus(machineId, "off", 90_000);

      const changeAction = await this.hetzner!.changeType(machineId, this.hetznerServerTypes[plan]);
      if (changeAction?.id) {
        await this.hetzner!.waitForAction(changeAction.id, 120_000);
      }

      const onAction = await this.hetzner!.powerOn(machineId);
      if (onAction?.id) {
        await this.hetzner!.waitForAction(onAction.id, 90_000);
      }
      await this.hetzner!.waitForServerStatus(machineId, "running", 90_000);
      return;
    }

    await this.machines!.updateMachineGuest(machineId, {
      cpus: PLAN_CONFIGS[plan].cpus,
      memory_mb: PLAN_CONFIGS[plan].memory_mb,
      cpu_kind: PLAN_CONFIGS[plan].cpu_kind,
    });
  }
}
