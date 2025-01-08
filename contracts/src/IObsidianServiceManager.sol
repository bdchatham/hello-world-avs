// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

interface IObsidianServiceManager {

    event CreateInstanceRequested(address indexed requester, bytes32 requestId, uint256 timestamp);
    event InstanceRegistered(address indexed requester, uint256 instanceId, uint256 timestamp);
    event TerminateInstanceRequested(address indexed requester, bytes32 requestId, uint256 timestamp);
    event InstanceDeregistered(address indexed requester, uint256 instanceId, uint256 timestamp);
    event ErrorReported(bytes32 requestId, string errorMessage, uint256 timestamp);

    function createInstance() external;

    function terminateInstance(uint256 instanceId) external;

    function registerInstance(address requester, uint256 instanceId) external;

    function deregisterInstance(address requester, uint256 instanceId) external;

    function reportError(bytes32 requestId, string calldata errorMessage) external;

}