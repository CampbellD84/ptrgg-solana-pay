import { createTransferCheckedInstruction, getAssociatedTokenAddress, getMint } from "@solana/spl-token";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { clusterApiUrl, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { NextApiRequest, NextApiResponse } from "next";
import { shopAddress, usdcAddress } from "../../lib/addresses"
import calculatePrice from "../../lib/calculatePrice"

export type MakeTransactionInputData = {
  account: string
}

export type MakeTransactionOutputData = {
  transaction: string,
  message: string
}

type ErrorOutput = {
  error: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const amount = calculatePrice(req.query)
    if (amount.toNumber() === 0) {
      res.status(400).json({ error: "Can't checkout with charge of 0" })
      return
    }

    const { reference } = req.query
    if (!reference) {
      res.status(400).json({ error: "No reference provided" })
      return
    }

    const { account } = req.body as MakeTransactionInputData
    if (!account) {
      res.status(400).json({ error: "No account provided" })
      return
    }

    const buyerPublicKey = new PublicKey(account)
    const shopPublicKey = shopAddress

    const network = WalletAdapterNetwork.Devnet
    const endpoint = clusterApiUrl(network)
    const connection = new Connection(endpoint)

    const usdcMint = await getMint(connection, usdcAddress)
    const buyerUsdcAddress = await getAssociatedTokenAddress(usdcAddress, buyerPublicKey)
    const shopUsdcAddress = await getAssociatedTokenAddress(usdcAddress, shopPublicKey)

    const { blockhash } = await (connection.getLatestBlockhash('finalized'))

    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: buyerPublicKey
    })

    const transferInstruction = createTransferCheckedInstruction(
      buyerUsdcAddress,
      usdcAddress,
      shopUsdcAddress,
      buyerPublicKey,
      amount.toNumber() * (10 ** (await usdcMint).decimals),
      usdcMint.decimals
    )

    transferInstruction.keys.push({
      pubkey: new PublicKey(reference),
      isSigner: false,
      isWritable: false
    })

    transaction.add(transferInstruction)

    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false
    })

    const base64 = serializedTransaction.toString('base64')

    res.status(200).json({
      transaction: base64,
      message: "Thanks for your order! 🍪"
    })
  } catch (err) {
    console.error(err)

    res.status(500).json({ error: 'error creating transaction' })
    return
  }
}