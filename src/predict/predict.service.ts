import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatEther, formatUnits, Wallet } from 'ethers';
import { OrderBuilder, ChainId } from '@predictdotfun/sdk';
import { GetAllMarketsResponse, GetAllPositionsResponse } from './types/market.types';
import { BalanceResponse } from './types/balance.types';
import { AuthMessageResponse, AuthResponse } from './types/auth.types';

@Injectable()
export class PredictService implements OnModuleInit {
  private readonly logger = new Logger(PredictService.name);
  private orderBuilder: OrderBuilder | null = null;
  private token: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.logger.log('Initializing predict bot...');
    await this.initialize();
  }

  private async initialize() {
    try {
      const errorInitializeMessage = 'environment variable is not set. Predict bot will not be initialized.';
      // Validate environment variable
      const baseUrl = this.configService.get<string>('PREDICT_API_BASE_URL');
      const apiKey = this.configService.get<string>('PREDICT_API_KEY');
      const predictAccount = this.configService.get<string>('PREDICT_ACCOUNT_ADDRESS');
      const walletPrivateKey = this.configService.get<string>('WALLET_PRIVATE_KEY');

      if (!baseUrl) {
        this.logger.warn(`PREDICT_API_BASE_URL ${errorInitializeMessage}`);
        return;
      } else if (!predictAccount) {
        this.logger.warn(`PREDICT_ACCOUNT_ADDRESS ${errorInitializeMessage}`)
        return;
      } else if (!apiKey) {
        this.logger.warn(`PREDICT_API_KEY ${errorInitializeMessage}`);
        return;
      } else if (!walletPrivateKey) {
        this.logger.warn(`WALLET_PRIVATE_KEY ${errorInitializeMessage}`);
        return;
      }

      // Initialize the wallet with your private key
      const signer = new Wallet(walletPrivateKey);
      this.logger.log(`Wallet address: ${signer.address}`);

      // Create a new instance of the OrderBuilder class. Note: This should only be done once per signer
      this.logger.log('Connecting to BSC network...');
      this.orderBuilder = await OrderBuilder.make(
        ChainId.BnbMainnet, 
        signer, 
        { predictAccount }
      );
      if (!this.orderBuilder) {
        throw new Error('OrderBuilder not initialized');
      }
      this.logger.log('OrderBuilder initialized successfully');
      this.token = await this.getJWTAuthorization(predictAccount, baseUrl, apiKey);

      const usdtBalance = await this.getUSDTBalance(predictAccount);
      this.logger.log(`Signer balance: ${usdtBalance.signerBalance} USDT`);
      this.logger.log(`Predict Account balance: ${usdtBalance.predictAccountBalance} USDT`);

      const markets = await this.getAllMarkets(baseUrl, apiKey);
      this.logger.log(`Total Predict Markets: ${markets.data.length}`);

      const positions = await this.getAllPositions(baseUrl, apiKey);
      this.logger.log(`Total Positions: ${positions.data.length}`);
      
      if (positions.data.length > 0) {
        console.log("================================================== Positions Table ========================================");
        const tableData = positions.data.map((position) => ({
          title: position.market.title,
          shares: formatEther(position.amount),
          usd: `$${parseFloat(position.valueUsd).toFixed(2)}`,
        }));
        
        console.table(tableData);
        console.log("================================================== Positions Table ========================================");
      } else {
        this.logger.log('No positions found');
      }

    } catch (error) {
      if (error instanceof Error) {
        this.logger.error('Error message:', error.message);
      } else {
        this.logger.error('Failed to initialize predict bot', error);
      }
    }
  }

  async getJWTAuthorization(signer: string, baseUrl: string, apiKey: string): Promise<any> {
    const headers = new Headers();
    headers.append('x-api-key', apiKey);

    const getRequestOptions = {
      method: 'GET',
      headers: headers,
      redirect: 'follow'
    };

    const messageResponse = await fetch(`${baseUrl}/auth/message`, getRequestOptions as RequestInit);
    const responseData = (await messageResponse.json()) as AuthMessageResponse;
    const signature = await this.orderBuilder!.signPredictAccountMessage(responseData.data.message);

    const raw = JSON.stringify({
      "signer": signer,
      "signature": signature,
      "message": responseData.data.message
   });

    const postRequestOptions = {
      method: 'POST',
      headers: headers,
      body: raw,
      redirect: 'follow'
   };

   const authResponse = await fetch(`${baseUrl}/auth`, postRequestOptions as RequestInit);
   const authData = (await authResponse.json()) as AuthResponse;
   return authData.data.token;
  }

  async getUSDTBalance(predictAccount: string): Promise<BalanceResponse> {
    const signerBalanceInWei = await this.orderBuilder!.balanceOf();

    if (!this.orderBuilder!.contracts) {
      return {
        signerBalance: formatUnits(signerBalanceInWei, 18),
        predictAccountBalance: "0.0"
      }
    }

    const predictAccountBalanceInWei = await this.orderBuilder!.contracts["USDT"]
      .contract
      .balanceOf(predictAccount);
    return {
      signerBalance: formatUnits(signerBalanceInWei, 18),
        predictAccountBalance: formatUnits(predictAccountBalanceInWei, 18)
    }
  }

  async getAllMarkets(baseUrl: string, apiKey: string): Promise<GetAllMarketsResponse> {
    const headers = new Headers();
    headers.append('x-api-key', apiKey);

    const requestOptions = {
      method: 'GET',
      headers: headers,
      redirect: 'follow',
    };
    const response = await fetch(`${baseUrl}/markets`, requestOptions as RequestInit);
    const data = (await response.json()) as GetAllMarketsResponse;
    return data;
  }

  async getAllPositions(baseUrl: string, apiKey: string): Promise<GetAllPositionsResponse> {
    if (!this.token) {
      throw new Error('JWT token not initialized. Please authenticate first.');
    }

    const headers = new Headers();
    headers.append('x-api-key', apiKey);
    headers.append('Authorization', `Bearer ${this.token}`);

    const requestOptions = {
      method: 'GET',
      headers: headers,
      redirect: 'follow',
    };
    const response = await fetch(`${baseUrl}/positions`, requestOptions as RequestInit);
    const data = (await response.json()) as GetAllPositionsResponse;
    return data;
  }
}

