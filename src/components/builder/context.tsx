"use client";

import { createContext, useContext } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { EdgeKind, NodeConfig, NodeType } from "@/lib/workflow/types";

export type FlowNodeData = {
  name: string;
  groupId: string | null;
  config: NodeConfig;
};

export type FlowEdgeData = {
  kind: EdgeKind;
  label: string;
  isRequired: boolean;
};

export type FlowNode = Node<FlowNodeData, NodeType>;
export type FlowEdge = Edge<FlowEdgeData>;

export type BuilderContextValue = {
  groups: Map<string, string>;
  nodeIssues: Map<string, "error" | "warning">;
  readOnly: boolean;
};

export const BuilderContext = createContext<BuilderContextValue>({
  groups: new Map(),
  nodeIssues: new Map(),
  readOnly: false,
});

export const useBuilder = () => useContext(BuilderContext);
