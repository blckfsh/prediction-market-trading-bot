import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatEther, formatUnits, Wallet } from 'ethers';
import { OrderBuilder, ChainId } from '@predictdotfun/sdk';
import {
  GetAllMarketsResponse,
  GetAllPositionsResponse,
  GetCategoriesByResponse,
  MarketVariant,
  Category,
  GetMarketStatisticsResponse,
} from './types/market.types';
import { BalanceResponse } from './types/balance.types';
import { AuthMessageResponse, AuthResponse } from './types/auth.types';
import { targetSlugs } from 'src/lib/constants';

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
      const errorInitializeMessage =
        'environment variable is not set. Predict bot will not be initialized.';
      // Validate environment variable
      const baseUrl = this.configService.get<string>('PREDICT_API_BASE_URL');
      const apiKey = this.configService.get<string>('PREDICT_API_KEY');
      const predictAccount = this.configService.get<string>(
        'PREDICT_ACCOUNT_ADDRESS',
      );
      const walletPrivateKey =
        this.configService.get<string>('WALLET_PRIVATE_KEY');

      if (!baseUrl) {
        this.logger.warn(`PREDICT_API_BASE_URL ${errorInitializeMessage}`);
        return;
      } else if (!predictAccount) {
        this.logger.warn(`PREDICT_ACCOUNT_ADDRESS ${errorInitializeMessage}`);
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
      this.orderBuilder = await OrderBuilder.make(ChainId.BnbMainnet, signer, {
        predictAccount,
      });
      if (!this.orderBuilder) {
        throw new Error('OrderBuilder not initialized');
      }
      this.logger.log('OrderBuilder initialized successfully');
      
      try {
        this.token = await this.getJWTAuthorization(
          predictAccount,
          baseUrl,
          apiKey,
        );
        this.logger.log('JWT authorization successful');
      } catch (error) {
        this.logger.warn(
          `Failed to get JWT authorization: ${error instanceof Error ? error.message : 'Unknown error'}. Some features requiring authentication may not work.`,
        );
        // Continue without token - positions won't be available but markets can still be fetched
      }

      try {
        const usdtBalance = await this.getUSDTBalance(predictAccount);
        this.logger.log(`Signer balance: ${usdtBalance.signerBalance} USDT`);
        this.logger.log(
          `Predict Account balance: ${usdtBalance.predictAccountBalance} USDT`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to get USDT balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      try {
        const markets = await this.getAllMarkets(baseUrl, apiKey);
        this.logger.log(`Total Predict Markets: ${markets.data.length}`);
      } catch (error) {
        throw new Error(
          `Failed to get all markets: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      let categories: Category[];
      try {
        categories = await this.getDefaultMarkets(baseUrl, apiKey);
      } catch (error) {
        throw new Error(
          `Failed to get default markets: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
      const filteredCategories = categories.filter((category) =>
        targetSlugs.includes(category.slug),
      );

      if (categories.length > 0) {
        console.log(
          '================================================== Categories Table ========================================',
        );
        const tableData = categories.map((category) => ({
          title: category.title,
          slug: category.slug,
          // startsAt: category.startsAt, // NOTE: you can display to see the date and time
        }));

        console.table(tableData);
        for (const category of filteredCategories) {
          if (category.markets.length > 0) {
            console.log(`-- Markets for category: ${category.title}`);
            // Process markets in batches to avoid rate limiting
            const batchSize = 5;
            const marketTable = [];
            
            for (let i = 0; i < category.markets.length; i += batchSize) {
              const batch = category.markets.slice(i, i + batchSize);
              const batchResults = await Promise.all(
                batch.map(async (market) => {
                  try {
                    const stats = await this.getMarketStatistics(
                      baseUrl,
                      apiKey,
                      market.id,
                    );
                    return {
                      id: market.id,
                      question: market.question,
                      status: market.status,
                      outcomes: market.outcomes
                        .map((outcome) => `${outcome.name} (${outcome.status})`)
                        .join(', '),
                      liquidity: stats.data.totalLiquidityUsd,
                      volume: stats.data.volumeTotalUsd,
                    };
                  } catch (error) {
                    this.logger.warn(
                      `Failed to fetch statistics for market ${market.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    );
                    return {
                      id: market.id,
                      question: market.question,
                      status: market.status,
                      outcomes: market.outcomes
                        .map((outcome) => `${outcome.name} (${outcome.status})`)
                        .join(', '),
                      liquidity: 'N/A',
                      volume: 'N/A',
                    };
                  }
                }),
              );
              marketTable.push(...batchResults);
              
              // Add a small delay between batches to avoid rate limiting
              if (i + batchSize < category.markets.length) {
                await new Promise((resolve) => setTimeout(resolve, 200));
              }
            }
            
            console.table(marketTable);
            
            // Calculate total liquidity for markets that have liquidity
            const totalLiquidity = marketTable
              .filter((market) => typeof market.liquidity === 'number')
              .reduce((sum, market) => sum + (market.liquidity as number), 0);
            
            // Calculate total volume for markets that have volume
            const totalVolume = marketTable
              .filter((market) => typeof market.volume === 'number')
              .reduce((sum, market) => sum + (market.volume as number), 0);
            
            console.log(`Total liquidity: ${totalLiquidity.toFixed(2)} USD`);
            console.log(`Total Volume: ${totalVolume.toFixed(2)} USD`);
          } else {
            console.log(`-- No markets for category: ${category.title}`);
          }
        }
        console.log(
          '================================================== Categories Table ========================================',
        );
      } else {
        this.logger.log('No categories found');
      }

      let positions;
      try {
        positions = await this.getAllPositions(baseUrl, apiKey);
        this.logger.log(`Total Positions: ${positions.data.length}`);
      } catch (error) {
        this.logger.warn(
          `Failed to get positions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        positions = { data: [] };
      }

      if (positions.data.length > 0) {
        console.log(
          '================================================== Positions Table ========================================',
        );
        const tableData = positions.data.map((position) => ({
          id: position.market.id,
          title: position.market.title,
          shares: formatEther(position.amount),
          usd: `$${parseFloat(position.valueUsd).toFixed(2)}`,
        }));

        console.table(tableData);
        console.log(
          '================================================== Positions Table ========================================',
        );
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

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = 3,
    delay = 1000,
  ): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status} ${response.statusText}`,
          );
        }

        return response;
      } catch (error) {
        if (i === retries - 1) {
          // Last retry failed
          if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Request timeout after 30 seconds');
          }
          throw error;
        }

        // Wait before retrying with exponential backoff
        const waitTime = delay * Math.pow(2, i);
        this.logger.warn(
          `Fetch attempt ${i + 1} failed, retrying in ${waitTime}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    throw new Error('All retry attempts failed');
  }

  async getJWTAuthorization(
    signer: string,
    baseUrl: string,
    apiKey: string,
  ): Promise<any> {
    const headers = new Headers();
    headers.append('x-api-key', apiKey);

    const getRequestOptions: RequestInit = {
      method: 'GET',
      headers: headers,
      redirect: 'follow' as RequestRedirect,
    };

    let messageResponse: Response;
    try {
      messageResponse = await this.fetchWithRetry(
        `${baseUrl}/auth/message`,
        getRequestOptions,
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch auth message: ${error.message}`);
      }
      throw new Error('Failed to fetch auth message: Unknown error');
    }

    const responseData = (await messageResponse.json()) as AuthMessageResponse;
    const signature = await this.orderBuilder!.signPredictAccountMessage(
      responseData.data.message,
    );

    const raw = JSON.stringify({
      signer: signer,
      signature: signature,
      message: responseData.data.message,
    });

    const postRequestOptions: RequestInit = {
      method: 'POST',
      headers: headers,
      body: raw,
      redirect: 'follow' as RequestRedirect,
    };

    let authResponse: Response;
    try {
      authResponse = await this.fetchWithRetry(
        `${baseUrl}/auth`,
        postRequestOptions,
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to authenticate: ${error.message}`);
      }
      throw new Error('Failed to authenticate: Unknown error');
    }

    const authData = (await authResponse.json()) as AuthResponse;
    return authData.data.token;
  }

  async getUSDTBalance(predictAccount: string): Promise<BalanceResponse> {
    const signerBalanceInWei = await this.orderBuilder!.balanceOf();

    if (!this.orderBuilder!.contracts) {
      return {
        signerBalance: formatUnits(signerBalanceInWei, 18),
        predictAccountBalance: '0.0',
      };
    }

    const predictAccountBalanceInWei =
      await this.orderBuilder!.contracts['USDT'].contract.balanceOf(
        predictAccount,
      );
    return {
      signerBalance: formatUnits(signerBalanceInWei, 18),
      predictAccountBalance: formatUnits(predictAccountBalanceInWei, 18),
    };
  }

  async getAllMarkets(
    baseUrl: string,
    apiKey: string,
  ): Promise<GetAllMarketsResponse> {
    const headers = new Headers();
    headers.append('x-api-key', apiKey);

    const requestOptions = {
      method: 'GET',
      headers: headers,
      redirect: 'follow',
    };
    
    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/markets`,
        requestOptions as RequestInit,
      );
      if (!response.ok) {
        throw new Error(
          `Failed to get markets: HTTP ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch markets: ${error.message}`);
      }
      throw new Error('Failed to fetch markets: Unknown error');
    }
    
    const data = (await response.json()) as GetAllMarketsResponse;
    return data;
  }

  async getDefaultMarkets(baseUrl: string, apiKey: string): Promise<Category[]> {
    const headers = new Headers();
    headers.append('x-api-key', apiKey);

    const requestOptions = {
      method: 'GET',
      headers: headers,
      redirect: 'follow',
    };

    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/categories?status=OPEN`,
        requestOptions as RequestInit,
      );
      if (!response.ok) {
        throw new Error(
          `Failed to get categories: HTTP ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch categories: ${error.message}`);
      }
      throw new Error('Failed to fetch categories: Unknown error');
    }
    
    const data = (await response.json()) as GetCategoriesByResponse;
    const defaultCategories = data.data
      .filter((category) => category.marketVariant === MarketVariant.DEFAULT)
      .sort((a, b) => {
        const dateA = new Date(a.startsAt).getTime();
        const dateB = new Date(b.startsAt).getTime();
        return dateB - dateA; // Descending order (newest first)
      });

    return defaultCategories;
  }

  async getMarketStatistics(baseUrl: string, apiKey: string, marketId: number): Promise<GetMarketStatisticsResponse> {
    const headers = new Headers();
    headers.append('x-api-key', apiKey);

    const requestOptions = {
      method: 'GET',
      headers: headers,
      redirect: 'follow',
    };

    const response = await fetch(
      `${baseUrl}/markets/${marketId}/stats`,
      requestOptions as RequestInit,
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as GetMarketStatisticsResponse;
    return data;
  }

  async getAllPositions(
    baseUrl: string,
    apiKey: string,
  ): Promise<GetAllPositionsResponse> {
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
    
    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/positions`,
        requestOptions as RequestInit,
      );
      if (!response.ok) {
        throw new Error(
          `Failed to get positions: HTTP ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch positions: ${error.message}`);
      }
      throw new Error('Failed to fetch positions: Unknown error');
    }
    
    const data = (await response.json()) as GetAllPositionsResponse;
    return data;
  }
}
