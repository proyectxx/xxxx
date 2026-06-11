// ============================================
// Atharium Token DApp - Frontend Logic
// ============================================

// Contract Address and ABI
const CONTRACT_ADDRESS = "0xd9145CCE52D386f254917e481eB44e9943F39138";
const CONTRACT_ABI = [
    {
        "inputs": [],
        "name": "getEthPrice",
        "outputs": [{"internalType": "int256", "name": "", "type": "int256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "annualMint",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getTimeUntilNextMint",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "nextMintReleaseTime",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "owner",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
        "stateMutability": "view",
        "type": "function"
    }
];

// Chainlink ETH/USD Oracle Address (Sepolia)
const ORACLE_ADDRESS = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const ORACLE_ABI = [
    {
        "inputs": [],
        "name": "latestRoundData",
        "outputs": [
            {"internalType": "uint80", "name": "roundId", "type": "uint80"},
            {"internalType": "int256", "name": "answer", "type": "int256"},
            {"internalType": "uint256", "name": "startedAt", "type": "uint256"},
            {"internalType": "uint256", "name": "updatedAt", "type": "uint256"},
            {"internalType": "uint80", "name": "answeredInRound", "type": "uint80"}
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

// Sepolia Chain ID
const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111 in hex

// Global Variables
let provider;
let signer;
let contract;
let oracleContract;
let currentAccount = null;
let isOwner = false;
let countdownInterval;
let refreshInterval;

// DOM Elements
const connectWalletBtn = document.getElementById("connect-wallet");
const disconnectWalletBtn = document.getElementById("disconnect-wallet");
const walletAddressEl = document.getElementById("wallet-address");
const ethPriceEl = document.getElementById("eth-price");
const priceTimestampEl = document.getElementById("price-timestamp");
const userBalanceEl = document.getElementById("user-balance");
const totalSupplyEl = document.getElementById("total-supply");
const nextMintTimeEl = document.getElementById("next-mint-time");
const countdownDaysEl = document.getElementById("countdown-days");
const countdownHoursEl = document.getElementById("countdown-hours");
const countdownMinsEl = document.getElementById("countdown-mins");
const countdownSecsEl = document.getElementById("countdown-secs");
const progressBarEl = document.getElementById("progress-bar");
const progressTextEl = document.getElementById("progress-text");
const mintButton = document.getElementById("mint-button");
const mintStatusEl = document.getElementById("mint-status");
const txStatusContainer = document.getElementById("tx-status-container");
const txStatusEl = document.getElementById("tx-status");
const txLinkEl = document.getElementById("tx-link");

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    // Initialize provider
    if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        oracleContract = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, provider);
    } else {
        showError("MetaMask not detected. Please install MetaMask.");
        return;
    }

    // Set up event listeners
    setupEventListeners();

    // Check if already connected
    const accounts = await provider.send("eth_accounts", []);
    if (accounts.length > 0) {
        await connectWallet(accounts[0]);
    }

    // Start refresh interval for data
    refreshInterval = setInterval(refreshData, 15000);
    await refreshData();
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    connectWalletBtn.addEventListener("click", handleConnectWallet);
    disconnectWalletBtn.addEventListener("click", disconnectWallet);
    mintButton.addEventListener("click", handleMint);

    // MetaMask Events
    if (window.ethereum) {
        window.ethereum.on("accountsChanged", (accounts) => {
            if (accounts.length === 0) {
                disconnectWallet();
            } else {
                connectWallet(accounts[0]);
            }
        });

        window.ethereum.on("chainChanged", (chainId) => {
            if (chainId !== SEPOLIA_CHAIN_ID) {
                showError("Please switch to Sepolia Testnet.");
                disconnectWallet();
            } else {
                location.reload();
            }
        });
    }
}

// ============================================
// WALLET CONNECTION
// ============================================

async function handleConnectWallet() {
    if (!window.ethereum) {
        showError("MetaMask not detected. Please install MetaMask.");
        return;
    }

    // Check if on Sepolia
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== SEPOLIA_CHAIN_ID) {
        try {
            await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: SEPOLIA_CHAIN_ID }]
            });
        } catch (error) {
            showError("Please switch to Sepolia Testnet manually.");
            return;
        }
    }

    // Request accounts
    try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        await connectWallet(accounts[0]);
    } catch (error) {
        showError("Failed to connect wallet: " + error.message);
    }
}

async function connectWallet(account) {
    currentAccount = account;
    signer = await provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // Check if owner
    const ownerAddress = await contract.owner();
    isOwner = account.toLowerCase() === ownerAddress.toLowerCase();

    // Update UI
    walletAddressEl.textContent = `${account.slice(0, 6)}...${account.slice(-4)}`;
    connectWalletBtn.style.display = "none";
    disconnectWalletBtn.style.display = "block";

    // Refresh data
    await refreshData();

    // Start countdown
    startCountdown();
}

function disconnectWallet() {
    currentAccount = null;
    signer = null;
    isOwner = false;

    // Update UI
    walletAddressEl.textContent = "Not connected";
    connectWalletBtn.style.display = "block";
    disconnectWalletBtn.style.display = "none";
    mintButton.disabled = true;
    mintButton.textContent = "Connect Wallet First";

    // Clear intervals
    if (countdownInterval) clearInterval(countdownInterval);

    // Reset displays
    ethPriceEl.textContent = "Loading...";
    userBalanceEl.textContent = "0 ATH";
    totalSupplyEl.textContent = "0 ATH";
    nextMintTimeEl.textContent = "Loading...";
    updateCountdown(0);
}

// ============================================
// DATA REFRESH
// ============================================

async function refreshData() {
    if (!contract) return;

    try {
        // Get ETH Price
        await updateEthPrice();

        // Get Balances
        if (currentAccount) {
            const balance = await contract.balanceOf(currentAccount);
            const decimals = await contract.decimals();
            userBalanceEl.textContent = `${ethers.formatUnits(balance, decimals)} ATH`;
        }

        // Get Total Supply
        const totalSupply = await contract.totalSupply();
        const decimals = await contract.decimals();
        totalSupplyEl.textContent = `${ethers.formatUnits(totalSupply, decimals)} ATH`;

        // Update Mint Button
        await updateMintButton();

    } catch (error) {
        console.error("Error refreshing data:", error);
    }
}

async function updateEthPrice() {
    try {
        // Try to get price from contract
        const price = await contract.getEthPrice();
        const priceInUSD = ethers.formatUnits(price, 8);
        ethPriceEl.textContent = `$${parseFloat(priceInUSD).toFixed(2)}`;
        priceTimestampEl.textContent = `Updated just now`;
    } catch (error) {
        console.log("Using fallback oracle for ETH price");
        // Fallback to direct oracle call
        try {
            const roundData = await oracleContract.latestRoundData();
            const price = roundData[1];
            const priceInUSD = ethers.formatUnits(price, 8);
            ethPriceEl.textContent = `$${parseFloat(priceInUSD).toFixed(2)}`;
            priceTimestampEl.textContent = `Updated just now (fallback)`;
        } catch (fallbackError) {
            ethPriceEl.textContent = "Error loading price";
            priceTimestampEl.textContent = "";
        }
    }
}

// ============================================
// MINT BUTTON LOGIC
// ============================================

async function updateMintButton() {
    if (!currentAccount) {
        mintButton.disabled = true;
        mintButton.textContent = "Connect Wallet First";
        return;
    }

    if (!isOwner) {
        mintButton.disabled = true;
        mintButton.textContent = "Owner Only";
        return;
    }

    try {
        const timeUntilNextMint = await contract.getTimeUntilNextMint();
        const now = Math.floor(Date.now() / 1000);
        const nextMintTime = now + parseInt(timeUntilNextMint);

        if (timeUntilNextMint > 0) {
            mintButton.disabled = true;
            mintButton.textContent = "Cooldown Active";
            nextMintTimeEl.textContent = new Date(nextMintTime * 1000).toLocaleString();
        } else {
            mintButton.disabled = false;
            mintButton.textContent = "Mint 100,000 ATH";
            nextMintTimeEl.textContent = "Available now!";
        }
    } catch (error) {
        mintButton.disabled = true;
        mintButton.textContent = "Error";
        console.error("Error updating mint button:", error);
    }
}

// ============================================
// COUNTDOWN LOGIC
// ============================================

function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(async () => {
        try {
            const timeUntilNextMint = await contract.getTimeUntilNextMint();
            updateCountdown(parseInt(timeUntilNextMint));
        } catch (error) {
            console.error("Error updating countdown:", error);
        }
    }, 1000);
}

function updateCountdown(secondsLeft) {
    if (secondsLeft <= 0) {
        countdownDaysEl.textContent = "00";
        countdownHoursEl.textContent = "00";
        countdownMinsEl.textContent = "00";
        countdownSecsEl.textContent = "00";
        progressBarEl.style.width = "100%";
        progressTextEl.textContent = "100% complete - Ready to mint!";
        return;
    }

    // Calculate time parts
    const days = Math.floor(secondsLeft / (3600 * 24));
    const hours = Math.floor((secondsLeft % (3600 * 24)) / 3600);
    const mins = Math.floor((secondsLeft % 3600) / 60);
    const secs = secondsLeft % 60;

    // Update DOM
    countdownDaysEl.textContent = String(days).padStart(2, "0");
    countdownHoursEl.textContent = String(hours).padStart(2, "0");
    countdownMinsEl.textContent = String(mins).padStart(2, "0");
    countdownSecsEl.textContent = String(secs).padStart(2, "0");

    // Update progress bar
    const totalCooldown = 365 * 24 * 3600; // 1 year in seconds
    const progress = ((totalCooldown - secondsLeft) / totalCooldown) * 100;
    progressBarEl.style.width = `${progress}%`;
    progressTextEl.textContent = `${Math.round(progress)}% complete`;
}

// ============================================
// MINT FUNCTION
// ============================================

async function handleMint() {
    if (!currentAccount || !isOwner) {
        showError("Only the owner can mint.");
        return;
    }

    try {
        const timeUntilNextMint = await contract.getTimeUntilNextMint();
        if (timeUntilNextMint > 0) {
            showError(`Please wait ${Math.ceil(parseInt(timeUntilNextMint) / 86400)} days.`);
            return;
        }

        // Show loading state
        mintButton.disabled = true;
        mintButton.textContent = "Minting...";
        mintStatusEl.textContent = "";
        mintStatusEl.className = "";

        // Send transaction
        const tx = await contract.annualMint();
        showTransactionStatus(tx.hash, "Minting transaction sent...");

        // Wait for confirmation
        const receipt = await tx.wait();
        if (receipt.status === 1) {
            showTransactionStatus(tx.hash, "Mint successful!", true);
            mintButton.textContent = "Mint 100,000 ATH";
            mintButton.disabled = false;
            await refreshData();
        } else {
            showError("Transaction failed.");
            mintButton.textContent = "Mint 100,000 ATH";
            mintButton.disabled = false;
        }

    } catch (error) {
        console.error("Mint error:", error);
        let errorMessage = "Unknown error";

        if (error.code === "ACTION_REJECTED") {
            errorMessage = "Transaction rejected by user.";
        } else if (error.message.includes("reverted")) {
            // Try to extract reason from error
            const reasonMatch = error.message.match(/reason: "([^"]+)"/);
            errorMessage = reasonMatch ? reasonMatch[1] : "Transaction reverted.";
        } else if (error.message.includes("insufficient funds")) {
            errorMessage = "Insufficient funds for gas.";
        } else if (error.message.includes("network error")) {
            errorMessage = "Network error. Please check your connection.";
        }

        showError(errorMessage);
        mintButton.textContent = "Mint 100,000 ATH";
        mintButton.disabled = false;
    }
}

// ============================================
// TRANSACTION STATUS
// ============================================

function showTransactionStatus(txHash, message, isSuccess = false) {
    txStatusContainer.style.display = "block";
    txStatusEl.textContent = message;
    txLinkEl.href = `https://sepolia.etherscan.io/tx/${txHash}`;
    txLinkEl.textContent = "View on Etherscan";

    if (isSuccess) {
        mintStatusEl.textContent = "Success!";
        mintStatusEl.className = "success";
    } else {
        mintStatusEl.textContent = "Pending...";
        mintStatusEl.className = "";
    }
}

// ============================================
// ERROR HANDLING
// ============================================

function showError(message) {
    mintStatusEl.textContent = message;
    mintStatusEl.className = "error";
    console.error(message);
}

// ============================================
// INITIALIZE APP
// ============================================

document.addEventListener("DOMContentLoaded", init);
