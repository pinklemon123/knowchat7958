export const libraryItemTypes = ["document", "image", "webpage", "other"] as const;
export type LibraryItemType = (typeof libraryItemTypes)[number];

export const libraryLocations = ["inbox", "library", "archive"] as const;
export type LibraryLocation = (typeof libraryLocations)[number];

export const fileRoles = ["primary", "attachment", "comment_image"] as const;
export type FileRole = (typeof fileRoles)[number];

export type LibraryItemSummary = {
  id: string;
  collectionId: string | null;
  collectionName: string | null;
  title: string;
  type: LibraryItemType;
  description: string | null;
  location: LibraryLocation;
  starred: boolean;
  sourceUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastOpenedAt: Date | null;
  lastActivityAt: Date;
  archivedAt: Date | null;
  deletedAt: Date | null;
  primaryFileId: string | null;
  primaryFileName: string | null;
  primaryMimeType: string | null;
  primarySizeBytes: number | null;
  tags: string[];
  commentCount: number;
};

export type LibraryItemFilters = {
  location?: LibraryLocation;
  collectionId?: string | null;
  starred?: boolean;
  query?: string;
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
  limit?: number;
  offset?: number;
};
