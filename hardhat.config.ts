import dotenv from 'dotenv';
import { HardhatUserConfig } from 'hardhat/config';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';

// Loading .env
dotenv.config();

const config: HardhatUserConfig = {
  solidity: '0.7.6',
  ...(process.env.ETHERSCAN_API_KEY && {
    etherscan: { apiKey: process.env.ETHERSCAN_API_KEY },
  }),
  networks: {
    hardhat: {
      chainId: 1337,
      accounts: {
        mnemonic: process.env.MNEMONIC,
      },
    },
    ...(process.env.KOVAN_INFURA_ENDPOINT &&
      process.env.KOVAN_PVK && {
        kovan: {
          url: process.env.KOVAN_INFURA_ENDPOINT,
          accounts: [process.env.KOVAN_PVK],
        },
      }),
  },
};

export default config;
