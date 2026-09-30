export interface Fh2Pagination {
  page: number;
  page_size: number;
  total: number;
  [key: string]: unknown;
}

export interface Fh2PaginatedList<T> {
  pagination: Fh2Pagination;
  list: T[];
  [key: string]: unknown;
}

export interface Fh2ListResult<T> {
  list: T[];
  pagination?: Fh2Pagination;
  [key: string]: unknown;
}

export interface Fh2DeviceModel {
  key: string;
  name: string;
  class: string;
  domain?: string;
  type?: string;
  sub_type?: string;
  device_model_key?: string;
  develop_code?: string;
  [key: string]: unknown;
}

export interface Fh2AssociateDevice {
  device_sn: string;
  device_callsign?: string;
  device_model?: Fh2DeviceModel | null;
  device_online_status?: boolean;
  device_working_status?: number;
  device_firmware_version?: string;
  device_add_time?: number;
  device_last_online_time?: number;
  device_state?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface Fh2ManageDevice {
  device_sn: string;
  device_callsign?: string;
  device_model?: Fh2DeviceModel | null;
  device_add_time?: number;
  device_last_online_time?: number;
  device_online_status?: boolean;
  device_working_status?: number;
  device_firmware_version?: string;
  device_active_project_name?: string;
  device_state?: Record<string, unknown> | null;
  associate_drone_device_info?: Fh2AssociateDevice | null;
  associate_relay_device_info?: Fh2AssociateDevice | null;
  associate_dock_device_info?: Fh2AssociateDevice | null;
  complete_machine_sn?: string | null;
  flysafe_database_version?: string;
  flysafe_database_upgrade_status?: number;
  parent_sns?: string[];
  [key: string]: unknown;
}

export interface Fh2HmsAlert {
  device_sn: string;
  level: number;
  module?: number;
  hms_id?: string;
  code?: string;
  message?: string;
  begin_time?: number;
  end_time?: number;
  device_data_create_time?: number;
  device_data_update_time?: number;
  domain_type?: string;
  status?: number;
  status_key?: string;
  sub_hms_list?: Fh2HmsAlert[];
  [key: string]: unknown;
}

export interface Fh2WaylineItem {
  id: string;
  name: string;
  drone_model_key?: string;
  [key: string]: unknown;
}

export interface Fh2FlightTaskFolderInfo {
  folder_id: string;
  expected_file_count: number;
  uploaded_file_count: number;
  [key: string]: unknown;
}

export interface Fh2FlightTaskException {
  code: number;
  message: string;
  sn: string;
  happen_at: string;
  [key: string]: unknown;
}

export interface Fh2FlightTask {
  flight_task_id: string;
  task_name: string;
  take_off_airport_sn?: string;
  task_type?: number;
  flight_task_type?: number;
  flight_task_status?: 1 | 2;
  task_status?: number;
  begin_at?: string | null;
  end_at?: string | null;
  run_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  current_waypoint_index?: number;
  total_waypoints?: number;
  wayline_uuid?: string;
  wayline_name?: string;
  user_name?: string;
  folder_info?: Fh2FlightTaskFolderInfo | null;
  media_upload_status?: number;
  exceptions?: Fh2FlightTaskException[];
  progress_version?: number;
  [key: string]: unknown;
}
