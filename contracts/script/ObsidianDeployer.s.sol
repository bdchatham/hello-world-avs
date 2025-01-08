// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/Test.sol";
import {CoreDeploymentLib} from "./utils/CoreDeploymentLib.sol";
import {ObsidianDeploymentLib} from "./utils/ObsidianDeploymentLib.sol";
import {UpgradeableProxyLib} from "./utils/UpgradeableProxyLib.sol";
import {ERC20Mock} from "../test/ERC20Mock.sol";
import {TransparentUpgradeableProxy} from
    "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {StrategyFactory} from "@eigenlayer/contracts/strategies/StrategyFactory.sol";
import {
    Quorum,
    StrategyParams,
    IStrategy
} from "@eigenlayer-middleware/src/interfaces/IECDSAStakeRegistryEventsAndErrors.sol";

contract ObsidianDeployer is Script {
    using CoreDeploymentLib for *;
    using UpgradeableProxyLib for address;

    address private deployer;
    address proxyAdmin;
    IStrategy obsidianStrategy;
    CoreDeploymentLib.DeploymentData coreDeployment;
    ObsidianDeploymentLib.DeploymentData obsidianDeployment;
    Quorum internal quorum;
    ERC20Mock private token;

    function setUp() public virtual {
        deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        vm.label(deployer, "Deployer");
        coreDeployment = CoreDeploymentLib.readDeploymentJson("deployments/core/", block.chainid);
    }

    function run() external {
        vm.startBroadcast(deployer);
        proxyAdmin = UpgradeableProxyLib.deployProxyAdmin();

        token = new ERC20Mock();
        obsidianStrategy = IStrategy(StrategyFactory(coreDeployment.strategyFactory).deployNewStrategy(token));

        quorum.strategies.push(
            StrategyParams({strategy: obsidianStrategy, multiplier: 10_000})
        );

        obsidianDeployment = ObsidianDeploymentLib.deployContracts(proxyAdmin, coreDeployment, quorum);
        obsidianDeployment.strategy = address(obsidianStrategy);
        obsidianDeployment.token = address(token);

        vm.stopBroadcast();

        verifyDeployment();
        ObsidianDeploymentLib.writeDeploymentJson(obsidianDeployment);
    }

    function verifyDeployment() internal view {
        require(obsidianDeployment.strategy != address(0), "StrategyFactory address cannot be zero");
        require(obsidianDeployment.stakeRegistry != address(0), "StakeRegistry address cannot be zero");
        require(coreDeployment.avsDirectory != address(0), "AVSDirectory address cannot be zero");
        require(coreDeployment.delegationManager != address(0), "DelegationManager address cannot be zero");
        require(proxyAdmin != address(0), "ProxyAdmin address cannot be zero");
    }
}
