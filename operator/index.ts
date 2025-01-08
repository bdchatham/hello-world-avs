import { ethers } from "ethers";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import axios from "axios";

dotenv.config();

// OpenStack Configuration
const openStackConfig = {
    authUrl: "http://openstack-keystone-url/v3", // Replace with your Keystone URL
    username: process.env.OS_USERNAME, // OpenStack username
    password: process.env.OS_PASSWORD, // OpenStack password
    projectId: process.env.OS_PROJECT_ID, // OpenStack project ID
    domainId: process.env.OS_DOMAIN_ID, // OpenStack domain ID
    novaEndpoint: "http://openstack-nova-url/v2.1", // Replace with your Nova endpoint
};

// Authenticate with OpenStack and retrieve a token
const getOpenStackToken = async () => {
    const response = await axios.post(`${openStackConfig.authUrl}/auth/tokens`, {
      auth: {
        identity: {
          methods: ["password"],
          password: {
            user: {
              name: openStackConfig.username,
              domain: { id: openStackConfig.domainId },
              password: openStackConfig.password,
            },
          },
        },
        scope: {
          project: {
            id: openStackConfig.projectId,
          },
        },
      },
    });
  
    const token = response.headers["x-subject-token"];
    return { token, projectId: openStackConfig.projectId };
};

// Create an instance in OpenStack
const createOpenStackInstance = async (token: string, instanceName: string) => {
    const instanceData = {
      server: {
        name: instanceName,
        imageRef: "your-image-id", // Replace with the OpenStack image ID
        flavorRef: "your-flavor-id", // Replace with the OpenStack flavor ID
        networks: [{ uuid: "your-network-id" }], // Replace with the network ID
      },
    };
  
    const response = await axios.post(
      `${openStackConfig.novaEndpoint}/servers`,
      instanceData,
      {
        headers: {
          "X-Auth-Token": token,
          "Content-Type": "application/json",
        },
      }
    );
  
    return response.data;
  };

// Setup environment variables
const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
const chainId = 31337;

const avsDeploymentData = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../contracts/deployments/obsidian/${chainId}.json`), 'utf8'));
const coreDeploymentData = JSON.parse(
    fs.readFileSync(
        path.resolve(__dirname, `../contracts/deployments/core/${chainId}.json`), 
        'utf8'
    )
);
const delegationManagerAddress = coreDeploymentData.addresses.delegation; // todo: reminder to fix the naming of this contract in the deployment file, change to delegationManager
const delegationManagerABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../abis/IDelegationManager.json'), 'utf8'));
const delegationManager = new ethers.Contract(delegationManagerAddress, delegationManagerABI, wallet);
const ecdsaRegistryABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../abis/ECDSAStakeRegistry.json'), 'utf8'));
const ecdsaStakeRegistryAddress = avsDeploymentData.addresses.stakeRegistry;
const ecdsaRegistryContract = new ethers.Contract(ecdsaStakeRegistryAddress, ecdsaRegistryABI, wallet);
const avsDirectoryAddress = coreDeploymentData.addresses.avsDirectory;
const avsDirectoryABI = JSON.parse(
    fs.readFileSync(
        path.resolve(__dirname, '../abis/IAVSDirectory.json'), 
        'utf8'
    )
);
const avsDirectory = new ethers.Contract(avsDirectoryAddress, avsDirectoryABI, wallet);
const obsidianServiceManagerAddress = avsDeploymentData.addresses.obsidianServiceManager;


// Load ABIs
const obsidianServiceManagerABI = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../abis/ObsidianServiceManager.json"), "utf8")
);

// Initialize the contract instance
const obsidianServiceManager = new ethers.Contract(
  obsidianServiceManagerAddress,
  obsidianServiceManagerABI,
  wallet
);

const registerOperator = async () => {
    console.log("Registering operator...");

    // Registers as an Operator in EigenLayer.
    try {
        const tx1 = await delegationManager.registerAsOperator({
            __deprecated_earningsReceiver: await wallet.address,
            delegationApprover: "0x0000000000000000000000000000000000000000",
            stakerOptOutWindowBlocks: 0
        }, "");
        await tx1.wait();
        console.log("Operator registered to Core EigenLayer contracts");
    } catch (error) {
        console.error("Error in registering as operator:", error);
    }
  
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const expiry = Math.floor(Date.now() / 1000) + 3600;

    const operatorDigestHash = await avsDirectory.calculateOperatorAVSRegistrationDigestHash(
        wallet.address,
        await obsidianServiceManagerAddress,
        salt,
        expiry
      );
    console.log(operatorDigestHash);
    
    // Sign the digest hash with the operator's private key
    console.log("Signing digest hash with operator's private key");
    const operatorSigningKey = new ethers.SigningKey(process.env.PRIVATE_KEY!);
    const operatorSignedDigestHash = operatorSigningKey.sign(operatorDigestHash);
  
    console.log("Registering Operator to AVS Registry contract");

    const operatorSignatureWithSaltAndExpiry = {
        signature: ethers.Signature.from(operatorSignedDigestHash).serialized,
        salt,
        expiry,
    };
  
    // Register Operator to AVS
    // Per release here: https://github.com/Layr-Labs/eigenlayer-middleware/blob/v0.2.1-mainnet-rewards/src/unaudited/ECDSAStakeRegistry.sol#L49
    const tx2 = await ecdsaRegistryContract.registerOperatorWithSignature(
        operatorSignatureWithSaltAndExpiry,
        wallet.address
    );
    await tx2.wait();
    console.log("Operator registered on AVS successfully");
  };
  

  const createInstance = async () => {
    try {
      const tx = await obsidianServiceManager.createInstance();
      const receipt = await tx.wait();
      console.log(`Instance created successfully. Transaction hash: ${receipt.transactionHash}`);
    } catch (error) {
      console.error("Error creating instance:", error);
    }
  };
  
  const terminateInstance = async (instanceId: number) => {
    try {
      console.log(`Terminating instance with ID: ${instanceId}`);
      const tx = await obsidianServiceManager.terminateInstance(instanceId);
      const receipt = await tx.wait();
      console.log(`Instance terminated successfully. Transaction hash: ${receipt.transactionHash}`);
    } catch (error) {
      console.error("Error terminating instance:", error);
    }
  };
  
  const monitorNewTasks = async () => {
    console.log("Monitoring for new tasks...");
  
    obsidianServiceManager.on(
      "CreateInstanceRequested",
      async (requester: string, requestId: string, timestamp: number) => {
        console.log(`New instance creation request detected:`);
        console.log(`- Requester: ${requester}`);
        console.log(`- Request ID: ${requestId}`);
        console.log(`- Timestamp: ${new Date(timestamp * 1000).toISOString()}`);
  
        try {
          // Authenticate with OpenStack
          const { token } = await getOpenStackToken();
          console.log("Authenticated with OpenStack.");
  
          // Generate a name for the instance
          const instanceName = `Instance-${requestId}`;
          console.log(`Creating OpenStack instance: ${instanceName}`);
  
          // Create the instance
          const instance = await createOpenStackInstance(token, instanceName);
          console.log(`OpenStack instance created successfully:`, instance);
  
          // Register the instance on the blockchain
          const tx = await obsidianServiceManager.registerInstance(requester, parseInt(requestId));
          await tx.wait();
          console.log("Instance registered successfully.");
        } catch (error) {
          if (error instanceof Error) {
            console.error("Error handling instance creation request:", error.message);
  
            // Optionally, report the error to the blockchain
            try {
              await obsidianServiceManager.reportError(requestId, error.message);
              console.log("Error reported to blockchain.");
            } catch (reportError) {
              if (reportError instanceof Error) {
                console.error("Error reporting to blockchain:", reportError.message);
              } else {
                console.error("Unknown error reporting to blockchain:", reportError);
              }
            }
          } else {
            console.error("Unknown error:", error);
          }
        }
      }
    );
  };
  
  
  const startCreatingTasks = () => {
    setInterval(() => {
      createInstance();
    }, 600000); 
  };

  const main = async () => {
    try {
      await registerOperator();
      monitorNewTasks();
      startCreatingTasks();
    } catch (error) {
      console.error("Error in main function:", error);
    }
  };
  
  main();
  
  