alter table workflow_nodes drop constraint workflow_nodes_node_type_check;
alter table workflow_nodes add constraint workflow_nodes_node_type_check
  check (node_type = any (array['start','stage','decision','parallel_split','join','wait','pending','end']));
