export interface AuthMessageData {
  message: string;
}

export interface AuthMessageResponse {
  success: boolean;
  data: AuthMessageData;
}

export interface AuthData {
  token: string;
}

export interface AuthResponse {
  success: boolean;
  data: AuthData;
}

