import { ethers } from 'hardhat';
import { expect } from 'chai';
import BalanceTree from '../src/balance-tree';

import { parseBalanceMap } from '../src/parse-balance-map';

const { Contract, BigNumber, constants } = ethers;

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

describe('MerkleDistributor', () => {
  let token;
  let wallets;
  let wallet0;
  let wallet1;
  let Distributor;

  beforeEach('deploy token & initialize wallets', async () => {
    Distributor = await ethers.getContractFactory('MerkleDistributor');
    const TestERC20 = await ethers.getContractFactory('TestERC20');

    token = await TestERC20.deploy('Token', 'TKN', 0);

    wallets = await ethers.getSigners();

    [wallet0, wallet1] = wallets;
  });

  describe('#token', () => {
    it('returns the token address', async () => {
      let distributor = await Distributor.deploy(token.address, ZERO_BYTES32);
      await distributor.deployed();
      expect(await distributor.token()).to.eq(token.address);
    });
  });

  describe('#merkleRoot', () => {
    it('returns the zero merkle root', async () => {
      let distributor = await Distributor.deploy(token.address, ZERO_BYTES32);

      expect(await distributor.merkleRoot()).to.eq(ZERO_BYTES32);
    });
  });

  describe('#claim', () => {
    it('fails for empty proof', async () => {
      let distributor = await Distributor.deploy(token.address, ZERO_BYTES32);

      await expect(
        distributor.claim(0, wallet0.address, 10, [])
      ).to.be.revertedWith('MerkleDistributor: Invalid proof.');
    });

    it('fails for invalid index', async () => {
      let distributor = await Distributor.deploy(token.address, ZERO_BYTES32);

      await expect(
        distributor.claim(0, wallet0.address, 10, [])
      ).to.be.revertedWith('MerkleDistributor: Invalid proof.');
    });

    describe('two account tree', () => {
      let distributor;
      let tree: BalanceTree;

      beforeEach('deploy', async () => {
        wallets = await ethers.getSigners();

        [wallet0, wallet1] = wallets;
        tree = new BalanceTree([
          { account: wallet0.address, amount: BigNumber.from(100) },
          { account: wallet1.address, amount: BigNumber.from(101) },
        ]);
        distributor = await Distributor.deploy(
          token.address,
          tree.getHexRoot()
        );
        await distributor.deployed();

        await token.setBalance(distributor.address, 201);
      });

      it('successful claim', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100));
        await expect(distributor.claim(0, wallet0.address, 100, proof0))
          .to.emit(distributor, 'Claimed')
          .withArgs(0, wallet0.address, 100);
        const proof1 = tree.getProof(1, wallet1.address, BigNumber.from(101));
        await expect(distributor.claim(1, wallet1.address, 101, proof1))
          .to.emit(distributor, 'Claimed')
          .withArgs(1, wallet1.address, 101);
      });

      it('transfers the token', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100));
        expect(await token.balanceOf(wallet0.address)).to.eq(0);
        await distributor.claim(0, wallet0.address, 100, proof0);
        expect(await token.balanceOf(wallet0.address)).to.eq(100);
      });

      it('must have enough to transfer', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100));
        await token.setBalance(distributor.address, 99);
        await expect(
          distributor.claim(0, wallet0.address, 100, proof0)
        ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
      });

      it('sets #isClaimed', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100));
        expect(await distributor.isClaimed(0)).to.eq(false);
        expect(await distributor.isClaimed(1)).to.eq(false);
        await distributor.claim(0, wallet0.address, 100, proof0);
        expect(await distributor.isClaimed(0)).to.eq(true);
        expect(await distributor.isClaimed(1)).to.eq(false);
      });

      it('cannot allow two claims', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100));
        await distributor.claim(0, wallet0.address, 100, proof0);
        await expect(
          distributor.claim(0, wallet0.address, 100, proof0)
        ).to.be.revertedWith('MerkleDistributor: Drop already claimed.');
      });

      it('cannot claim more than once: 0 and then 1', async () => {
        await distributor.claim(
          0,
          wallet0.address,
          100,
          tree.getProof(0, wallet0.address, BigNumber.from(100))
        );
        await distributor.claim(
          1,
          wallet1.address,
          101,
          tree.getProof(1, wallet1.address, BigNumber.from(101))
        );

        await expect(
          distributor.claim(
            0,
            wallet0.address,
            100,
            tree.getProof(0, wallet0.address, BigNumber.from(100))
          )
        ).to.be.revertedWith('MerkleDistributor: Drop already claimed.');
      });

      it('cannot claim more than once: 1 and then 0', async () => {
        await distributor.claim(
          1,
          wallet1.address,
          101,
          tree.getProof(1, wallet1.address, BigNumber.from(101))
        );
        await distributor.claim(
          0,
          wallet0.address,
          100,
          tree.getProof(0, wallet0.address, BigNumber.from(100))
        );

        await expect(
          distributor.claim(
            1,
            wallet1.address,
            101,
            tree.getProof(1, wallet1.address, BigNumber.from(101))
          )
        ).to.be.revertedWith('MerkleDistributor: Drop already claimed.');
      });

      it('cannot claim for address other than proof', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100));
        await expect(
          distributor.claim(1, wallet1.address, 101, proof0)
        ).to.be.revertedWith('MerkleDistributor: Invalid proof.');
      });

      it('cannot claim more than proof', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100));
        await expect(
          distributor.claim(0, wallet0.address, 101, proof0)
        ).to.be.revertedWith('MerkleDistributor: Invalid proof.');
      });
    });
    describe('larger tree', () => {
      let distributor;
      let tree: BalanceTree;
      beforeEach('deploy', async () => {
        tree = new BalanceTree(
          wallets.map((wallet, ix) => {
            return { account: wallet.address, amount: BigNumber.from(ix + 1) };
          })
        );
        distributor = await Distributor.deploy(
          token.address,
          tree.getHexRoot()
        );
        await distributor.deployed();

        await token.setBalance(distributor.address, 201);
      });

      it('claim index 4', async () => {
        const proof = tree.getProof(4, wallets[4].address, BigNumber.from(5));
        await expect(distributor.claim(4, wallets[4].address, 5, proof))
          .to.emit(distributor, 'Claimed')
          .withArgs(4, wallets[4].address, 5);
      });

      it('claim index 9', async () => {
        const proof = tree.getProof(9, wallets[9].address, BigNumber.from(10));
        await expect(distributor.claim(9, wallets[9].address, 10, proof))
          .to.emit(distributor, 'Claimed')
          .withArgs(9, wallets[9].address, 10);
      });
    });
  });

  describe('realistic size tree', () => {
    let distributor;
    let tree: BalanceTree;
    const NUM_LEAVES = 100_000;
    const NUM_SAMPLES = 25;
    const elements: { account: string; amount: any }[] = [];
    before(async () => {
      for (let i = 0; i < NUM_LEAVES; i++) {
        const node = {
          account: wallet0.address,
          amount: BigNumber.from(100),
        };
        elements.push(node);
      }
      tree = new BalanceTree(elements);
    });

    it('proof verification works', () => {
      const root = Buffer.from(tree.getHexRoot().slice(2), 'hex');
      for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
        const proof = tree
          .getProof(i, wallet0.address, BigNumber.from(100))
          .map((el) => Buffer.from(el.slice(2), 'hex'));
        const validProof = BalanceTree.verifyProof(
          i,
          wallet0.address,
          BigNumber.from(100),
          proof,
          root
        );
        expect(validProof).to.be.true;
      }
    });

    beforeEach('deploy', async () => {
      distributor = await Distributor.deploy(token.address, tree.getHexRoot());

      await token.setBalance(distributor.address, constants.MaxUint256);
    });

    it('no double claims in random distribution', async () => {
      for (
        let i = 0;
        i < 25;
        i += Math.floor(Math.random() * (NUM_LEAVES / NUM_SAMPLES))
      ) {
        const proof = tree.getProof(i, wallet0.address, BigNumber.from(100));
        await distributor.claim(i, wallet0.address, 100, proof);
        await expect(
          distributor.claim(i, wallet0.address, 100, proof)
        ).to.be.revertedWith('MerkleDistributor: Drop already claimed.');
      }
    });
  });

  describe('parseBalanceMap', () => {
    let distributor;
    let claims: {
      [account: string]: {
        index: number;
        amount: string;
        proof: string[];
      };
    };
    beforeEach('deploy', async () => {
      const { claims: innerClaims, merkleRoot, tokenTotal } = parseBalanceMap({
        [wallet0.address]: 200,
        [wallet1.address]: 300,
        [wallets[2].address]: 250,
      });
      expect(tokenTotal).to.eq('0x02ee'); // 750
      claims = innerClaims;
      distributor = await Distributor.deploy(token.address, merkleRoot);

      await token.setBalance(distributor.address, tokenTotal);
    });

    it('check the proofs is as expected', () => {
      expect(claims).to.deep.eq({
        '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': {
          index: 0,
          amount: '0xfa',
          proof: [
            '0x0c9bcaca2a1013557ef7f348b514ab8a8cd6c7051b69e46b1681a2aff22f4a88',
          ],
        },
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8': {
          index: 1,
          amount: '0x012c',
          proof: [
            '0xc86fd316fa3e7b83c2665b5ccb63771e78abcc0429e0105c91dde37cb9b857a4',
            '0xf3c5acb53398e1d11dcaa74e37acc33d228f5da944fbdea9a918684074a21cdb',
          ],
        },
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266': {
          index: 2,
          amount: '0xc8',
          proof: [
            '0x0782528e118c4350a2465fbeabec5e72fff06991a29f21c08d37a0d275e38ddd',
            '0xf3c5acb53398e1d11dcaa74e37acc33d228f5da944fbdea9a918684074a21cdb',
          ],
        },
      });
    });

    it('all claims work exactly once', async () => {
      for (let account in claims) {
        const claim = claims[account];
        await expect(
          distributor.claim(claim.index, account, claim.amount, claim.proof)
        )
          .to.emit(distributor, 'Claimed')
          .withArgs(claim.index, account, claim.amount);
        await expect(
          distributor.claim(claim.index, account, claim.amount, claim.proof)
        ).to.be.revertedWith('MerkleDistributor: Drop already claimed.');
      }
      expect(await token.balanceOf(distributor.address)).to.eq(0);
    });
  });
});
