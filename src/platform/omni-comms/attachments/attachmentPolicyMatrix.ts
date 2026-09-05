/**
 * OMNI-COMMS — Channel attachment policy matrix (single source of truth).
 *
 * Physical document carriage is a CHANNEL capability, not a business-module
 * decision. Business modules declare a governed attachment and whether the
 * document is mandatory; the Hub decides how each channel honours it.
 *
 * The authoritative record lives in `omni_comms_channel_attachment_policy`;
 * this module mirrors it for UI/explanation and for compile-time reasoning.
 * Runtime enforcement is server-side only
 * (`omni_comms_priv_resolve_message_attachments`).
 */

export type OmniCommsChannel =
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'push'
  | 'in_app'
  | 'print'
  | 'voice'
  | 'webhook';

export type AttachmentRequirementScope =
  | 'all_channels'
  | 'attachment_capable_channels';

export interface ChannelAttachmentPolicy {
  channel: OmniCommsChannel;
  /** Can the channel physically carry the document bytes? */
  supportsAttachments: boolean;
  maxAttachments: number;
  maxTotalBytes: number;
  /** How a governed document reaches the recipient on this channel. */
  carriage: 'file' | 'secure_link' | 'physical_enclosure' | 'not_applicable';
  /** Plain-language governance note shown in the console/evidence packs. */
  note: string;
}

export const OMNI_COMMS_CHANNEL_ATTACHMENT_POLICY: Record<
  OmniCommsChannel,
  ChannelAttachmentPolicy
> = {
  email: {
    channel: 'email',
    supportsAttachments: true,
    maxAttachments: 10,
    maxTotalBytes: 20 * 1024 * 1024,
    carriage: 'file',
    note: 'Carries the exact sealed PDF bytes. A missing or altered mandatory document blocks the send.',
  },
  in_app: {
    channel: 'in_app',
    supportsAttachments: false,
    maxAttachments: 0,
    maxTotalBytes: 0,
    carriage: 'secure_link',
    note: 'Delivers a governed deep link to the sealed document inside the platform. Never blocked by a document that is mandatory only for file-carrying channels.',
  },
  sms: {
    channel: 'sms',
    supportsAttachments: false,
    maxAttachments: 0,
    maxTotalBytes: 0,
    carriage: 'secure_link',
    note: 'Notification only. Documents are never sent over SMS.',
  },
  whatsapp: {
    channel: 'whatsapp',
    supportsAttachments: false,
    maxAttachments: 0,
    maxTotalBytes: 0,
    carriage: 'secure_link',
    note: 'Media carriage is not enabled for governed audit documents.',
  },
  push: {
    channel: 'push',
    supportsAttachments: false,
    maxAttachments: 0,
    maxTotalBytes: 0,
    carriage: 'secure_link',
    note: 'Alert only; the document is opened in the platform.',
  },
  print: {
    channel: 'print',
    supportsAttachments: false,
    maxAttachments: 0,
    maxTotalBytes: 0,
    carriage: 'physical_enclosure',
    note: 'Physical production is handled by the print pipeline, not by message attachments.',
  },
  voice: {
    channel: 'voice',
    supportsAttachments: false,
    maxAttachments: 0,
    maxTotalBytes: 0,
    carriage: 'not_applicable',
    note: 'Spoken channel. Documents cannot be carried.',
  },
  webhook: {
    channel: 'webhook',
    supportsAttachments: false,
    maxAttachments: 0,
    maxTotalBytes: 0,
    carriage: 'secure_link',
    note: 'Machine integration receives governed metadata and a reference, never raw bytes.',
  },
};

/** Channels that can physically carry a mandatory formal document. */
export function attachmentCapableChannels(): OmniCommsChannel[] {
  return (Object.keys(OMNI_COMMS_CHANNEL_ATTACHMENT_POLICY) as OmniCommsChannel[])
    .filter((c) => OMNI_COMMS_CHANNEL_ATTACHMENT_POLICY[c].supportsAttachments);
}

/**
 * Does a governed attachment block this channel?
 * Mirrors the server rule exactly.
 */
export function attachmentBlocksChannel(
  channel: OmniCommsChannel,
  requiredForDelivery: boolean,
  scope: AttachmentRequirementScope = 'all_channels',
): boolean {
  if (!requiredForDelivery) return false;
  const policy = OMNI_COMMS_CHANNEL_ATTACHMENT_POLICY[channel];
  if (!policy) return true;
  if (policy.supportsAttachments) return false;
  return scope === 'all_channels';
}
