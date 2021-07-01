import { ethers } from 'hardhat';
import fs from 'fs';

import BalanceTree from '../src/balance-tree';

async function main() {
  let accounts = await ethers.getSigners();

  const { chainId } = await ethers.provider.getNetwork();

  const Distributor = await ethers.getContractFactory('MerkleDistributor');

  let distributor;

  if (chainId === 1337) {
    const Token = await ethers.getContractFactory('TestERC20');

    let token = await Token.deploy(
      'Test Token',
      'TTO',
      '100000000000000000000'
    );

    const tree = new BalanceTree([
      {
        account: accounts[0].address,
        amount: ethers.BigNumber.from('100000000000000000000'),
      },
    ]);

    distributor = await Distributor.deploy(token.address, tree.getHexRoot());

    await token.transfer(distributor.address, '100000000000000000000');
  }

  await distributor.deployed();

  let currentAddresses = {};
  if (fs.existsSync(`${__dirname}/../addresses.json`)) {
    currentAddresses = JSON.parse(
      fs.readFileSync(`${__dirname}/../addresses.json`).toString()
    );
  }

  const newAddresses = {
    ...currentAddresses,
    [chainId]: {
      distributor: distributor.address,
    },
  };

  fs.writeFileSync(
    `${__dirname}/../addresses.json`,
    JSON.stringify(newAddresses)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
