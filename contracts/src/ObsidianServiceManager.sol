pragma solidity ^0.8.9;

import {ECDSAServiceManagerBase} from "@eigenlayer-middleware/src/unaudited/ECDSAServiceManagerBase.sol";
import {ECDSAStakeRegistry} from "@eigenlayer-middleware/src/unaudited/ECDSAStakeRegistry.sol";
import {IServiceManager} from "@eigenlayer-middleware/src/interfaces/IServiceManager.sol";
import {ECDSAUpgradeable} from "@openzeppelin-upgrades/contracts/utils/cryptography/ECDSAUpgradeable.sol";
import {IERC1271Upgradeable} from "@openzeppelin-upgrades/contracts/interfaces/IERC1271Upgradeable.sol";
import {IObsidianServiceManager} from "./IObsidianServiceManager.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title Primary entry point for managing instance lifecycle tasks for Obsidian services.
 */
contract ObsidianServiceManager is ECDSAServiceManagerBase, IObsidianServiceManager {
    using ECDSAUpgradeable for bytes32;

    mapping(uint256 => bool) public registeredInstances;
    uint256 private requestIdNonce;

    constructor(
        address _avsDirectory,
        address _stakeRegistry,
        address _rewardsCoordinator,
        address _delegationManager
    )
        ECDSAServiceManagerBase(
            _avsDirectory,
            _stakeRegistry,
            _rewardsCoordinator,
            _delegationManager
        )
    {}

    function _generateRequestId() private returns (bytes32) {
        requestIdNonce += 1; 
        return keccak256(abi.encodePacked(msg.sender, block.timestamp, block.number, requestIdNonce));
    }

    function createInstance() external {
        bytes32 requestId = _generateRequestId();
        emit CreateInstanceRequested(msg.sender, requestId, block.timestamp);
    }

    function terminateInstance(uint256 instanceId) external {
        require(registeredInstances[instanceId], "Instance not registered");
        bytes32 requestId = _generateRequestId();
        emit TerminateInstanceRequested(msg.sender, requestId, block.timestamp);
    }

    function registerInstance(address requester, uint256 instanceId) external {
        require(!registeredInstances[instanceId], "Instance already registered");
        registeredInstances[instanceId] = true;
        emit InstanceRegistered(requester, instanceId, block.timestamp);
    }

    function deregisterInstance(address requester, uint256 instanceId) external {
        require(registeredInstances[instanceId], "Instance not registered");
        registeredInstances[instanceId] = false;
        emit InstanceDeregistered(requester, instanceId, block.timestamp);
    }

    function reportError(bytes32 requestId, string calldata errorMessage) external {
        emit ErrorReported(requestId, errorMessage, block.timestamp);
    }
}